#!/usr/bin/env python3
"""Independent optimistic native-warp reachability audit, without a hop limit.

A state is an actual arrival coordinate. Ordinary regions connect to warp
entrances; adjacent warp entrances are also allowed even if they have no common
ordinary region. Diagonal corner supports for this last rule are deliberately
ignored, making this an overapproximation useful for proving unreachability.
Input is the read-only global graph export from navigation-global-graph_test.go.txt.
"""
from collections import defaultdict, deque
import hashlib
import json
from pathlib import Path
import sys

source = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/sa1121-navigation/global-graph.json')
raw = source.read_bytes()
graph = json.loads(raw)
by_floor = defaultdict(list)
for edge in graph['edges']:
    by_floor[edge['Floor']].append(edge)
for edges in by_floor.values():
    edges.sort(key=lambda e: (e['Y'], e['X'], e['ToFloor'], e['ToY'], e['ToX']))
points = {(p['Floor'], p['X'], p['Y']): set(p['Regions'] or []) for p in graph['points']}
assert all(points.values()), 'query points must have actual ordinary region IDs'
queries = [((703, 238, 96), [(703, 390, y) for y in range(261, 266)]),
           ((704, 13, 81), [(704, 11, 113)]),
           ((704, 13, 81), [(704, 11, 115)]),
           ((704, 13, 81), [(704, 9, y) for y in range(261, 266)])]
results = []
for start, goals in queries:
    queue = deque([(start, points[start], 0)])
    visited = {start}
    reached_regions = defaultdict(set)
    reached = False
    while queue:
        (floor, x, y), regions, depth = queue.popleft()
        reached_regions[floor].update(regions)
        if any(goal[0] == floor and regions.intersection(points[goal]) for goal in goals):
            reached = True
            break
        for edge in by_floor[floor]:
            adjacent = max(abs(edge['X'] - x), abs(edge['Y'] - y)) == 1
            connected = bool(regions.intersection(edge['Source'] or []))
            if not adjacent and not connected:
                continue
            destination = (edge['ToFloor'], edge['ToX'], edge['ToY'])
            if destination not in visited:
                visited.add(destination)
                queue.append((destination, set(edge['Destination'] or []), depth + 1))
    results.append({'start': start, 'goals': goals, 'reachable_in_optimistic_graph': reached,
                    'visited_arrival_coordinates': len(visited), 'reachable_floors': len(reached_regions),
                    'source_floor_reachable_regions': sorted(reached_regions[start[0]]),
                    'goal_regions': sorted(set().union(*(points[p] for p in goals)))})
print(json.dumps({'scope': 'input safeNavigationWarp subset (walkable source and landing); ordinary region connectivity plus optimistic adjacent warp steps; no hop limit; excludes wall landings and FREE branches',
                  'input_sha256': hashlib.sha256(raw).hexdigest(), 'native_edges': len(graph['edges']),
                  'queries': results}, ensure_ascii=False, indent=2))
