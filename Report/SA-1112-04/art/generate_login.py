"""Original local SVG illustration for StoneAge. No image-generation service or stock art.
Run with the provided Playwright Python environment; output is always 1280x960.
The complete artwork is drawn in SVG below; the embedded font makes its text portable.
"""
from pathlib import Path
import base64
import json
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[3]
ART = ROOT / 'client' / 'art'
ART.mkdir(parents=True, exist_ok=True)
FONT = base64.b64encode(Path('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf').read_bytes()).decode()
SVG = r'''<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="960" viewBox="0 0 800 600">
<defs>
  <style>@font-face{font-family:StoneLogo;src:url(data:font/ttf;base64,FONTDATA)}.edge{stroke:#17473f;stroke-width:3.2;stroke-linecap:round;stroke-linejoin:round}.ink{stroke:#25483e;stroke-width:2.4;stroke-linecap:round;stroke-linejoin:round}.fine{fill:none;stroke-linecap:round;stroke-linejoin:round}</style>
  <linearGradient id="sky" x2="0" y2="1"><stop stop-color="#81d7ce"/><stop offset=".43" stop-color="#c3e7c4"/><stop offset="1" stop-color="#f8d690"/></linearGradient>
  <radialGradient id="sun"><stop stop-color="#fff6c5"/><stop offset=".5" stop-color="#ffe7a1" stop-opacity=".8"/><stop offset="1" stop-color="#ffe7a1" stop-opacity="0"/></radialGradient>
  <linearGradient id="sea" x2="0" y2="1"><stop stop-color="#6ecbc1"/><stop offset=".5" stop-color="#299a9c"/><stop offset="1" stop-color="#185f75"/></linearGradient>
  <linearGradient id="farIsland" x2="0" y2="1"><stop stop-color="#568e86"/><stop offset="1" stop-color="#82bcb0"/></linearGradient>
  <linearGradient id="rock" x1="0" y1="0" x2=".7" y2="1"><stop stop-color="#d7b587"/><stop offset=".35" stop-color="#a99774"/><stop offset="1" stop-color="#4e7a68"/></linearGradient>
  <linearGradient id="stone" x2=".8" y2="1"><stop stop-color="#e3d0a6"/><stop offset=".5" stop-color="#b4b695"/><stop offset="1" stop-color="#738e74"/></linearGradient>
  <linearGradient id="grass" x2="0" y2="1"><stop stop-color="#b9d889"/><stop offset="1" stop-color="#638e48"/></linearGradient>
  <linearGradient id="waterfall" x2="1" y2="0"><stop stop-color="#d6f7e2"/><stop offset=".4" stop-color="#f5fff0"/><stop offset="1" stop-color="#78cec6"/></linearGradient>
  <linearGradient id="jungle" x2=".4" y2="1"><stop stop-color="#1c6f62"/><stop offset="1" stop-color="#103c3b"/></linearGradient>
  <linearGradient id="leaf" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#9bc773"/><stop offset=".45" stop-color="#3e9a64"/><stop offset="1" stop-color="#20644d"/></linearGradient>
  <linearGradient id="leafDark"><stop stop-color="#1d6653"/><stop offset="1" stop-color="#123d38"/></linearGradient>
  <linearGradient id="leafGold" x2=".8" y2="1"><stop stop-color="#e1dc84"/><stop offset="1" stop-color="#8eac57"/></linearGradient>
  <linearGradient id="dino" x1="0" y1="0" x2=".75" y2="1"><stop stop-color="#b8dc6a"/><stop offset=".4" stop-color="#8acb64"/><stop offset="1" stop-color="#3f9762"/></linearGradient>
  <linearGradient id="dinoFace" x2=".4" y2="1"><stop stop-color="#cef08a"/><stop offset="1" stop-color="#83c56b"/></linearGradient>
  <linearGradient id="belly" x2="0" y2="1"><stop stop-color="#fff0b1"/><stop offset="1" stop-color="#d3c17f"/></linearGradient>
  <radialGradient id="eye"><stop stop-color="#f8c754"/><stop offset=".8" stop-color="#be7d29"/><stop offset="1" stop-color="#805020"/></radialGradient>
  <linearGradient id="skin" x2=".5" y2="1"><stop stop-color="#ffe6ac"/><stop offset=".55" stop-color="#efb67d"/><stop offset="1" stop-color="#c98d61"/></linearGradient>
  <linearGradient id="hair" x2=".5" y2="1"><stop stop-color="#f6af53"/><stop offset=".45" stop-color="#c76a35"/><stop offset="1" stop-color="#813b2e"/></linearGradient>
  <linearGradient id="fur" x2=".8" y2="1"><stop stop-color="#fff0c1"/><stop offset=".45" stop-color="#dfc086"/><stop offset="1" stop-color="#b48e5d"/></linearGradient>
  <linearGradient id="leather" x2=".8" y2="1"><stop stop-color="#a96743"/><stop offset="1" stop-color="#684c38"/></linearGradient>
  <linearGradient id="logo" x2="0" y2="1"><stop stop-color="#ffffd9"/><stop offset=".5" stop-color="#fff0b3"/><stop offset=".51" stop-color="#f3cd78"/><stop offset="1" stop-color="#dba75b"/></linearGradient>
  <linearGradient id="formShade" x2="1" y2="0"><stop stop-color="#123f3b" stop-opacity="0"/><stop offset=".45" stop-color="#113c39" stop-opacity=".73"/><stop offset="1" stop-color="#0c3032" stop-opacity=".9"/></linearGradient>
  <linearGradient id="bottomShade" x2="0" y2="1"><stop stop-color="#103e36" stop-opacity="0"/><stop offset="1" stop-color="#0b3032" stop-opacity=".95"/></linearGradient>
  <radialGradient id="vignette"><stop offset=".4" stop-color="#0d3932" stop-opacity="0"/><stop offset="1" stop-color="#0d3932" stop-opacity=".45"/></radialGradient>
  <filter id="shadow" x="-.3" y="-.3" width="1.6" height="1.6"><feDropShadow dx="0" dy="5" stdDeviation="4" flood-color="#0c3a31" flood-opacity=".3"/></filter>
  <filter id="logoShadow" x="-.1" y="-.2" width="1.2" height="1.5"><feDropShadow dx="0" dy="4" stdDeviation="1" flood-color="#0c3c38" flood-opacity=".5"/></filter>
  <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves="3" stitchTiles="stitch"/><feColorMatrix type="saturate" values="0"/><feComponentTransfer><feFuncA type="linear" slope=".13"/></feComponentTransfer><feBlend in="SourceGraphic" mode="soft-light"/></filter>
  <g id="bigLeaf"><path d="M0 0C-36-13-45-52-40-78C-7-69 20-37 0 0Z" fill="url(#leaf)" stroke="#225c47" stroke-width="1.4"/><path d="M0 0L-35-69M-13-25L-27-30M-18-37L-17-51M-27-53L-38-55" class="fine" stroke="#b8d882" stroke-width="1.3"/></g>
  <g id="fern"><path d="M0 0Q-9-40-2-90" class="fine" stroke="#468b58" stroke-width="2"/><g fill="url(#leaf)"><path d="M-4-12Q-36-13-43-37Q-17-33-4-12M-5-29Q-31-34-33-57Q-12-49-5-29M-4-48Q-22-56-19-77Q-3-68-4-48M-3-66Q-13-78-3-94Q5-78-3-66M-4-21Q21-25 27-48Q5-41-4-21M-4-40Q17-46 19-65Q0-56-4-40M-3-57Q12-67 10-84Q-2-74-3-57"/></g></g>
  <g id="palm"><path d="M0 132Q20 62 0 0" class="fine" stroke="#705d44" stroke-width="11"/><path d="M-1 128Q18 59-1 4" class="fine" stroke="#ad9870" stroke-width="4"/><g fill="#307e61"><path d="M0 0Q-48-42-100-2Q-50-15 0 0M0 0Q-26-61-68-52Q-31-32 0 0M0 0Q12-66 60-62Q19-35 0 0M0 0Q63-47 104-9Q51-20 0 0M0 0Q63-8 83 48Q44 18 0 0M0 0Q-58-10-74 39Q-40 13 0 0"/></g><circle cx="3" cy="3" r="8" fill="#84734a"/><circle cx="-7" cy="8" r="6" fill="#95824e"/></g>
  <g id="cloud" fill="#eff9de"><path d="M0 0Q4-14 20-11Q26-28 43-21Q54-24 63-9Q77-12 82 0Z"/></g>
  <g id="flower"><path d="M0-2C-15-19-25-8-7 2C-25 7-13 22-1 7C4 25 19 17 7 3C28 1 19-16 5-5C12-26-5-26 0-2" fill="#e69b6f" stroke="#8f6050" stroke-width="1.5"/><circle r="4" fill="#f7dc87"/></g>
  <g id="spark"><path d="M0-5L1.5-1.5 5 0 1.5 1.5 0 5-1.5 1.5-5 0-1.5-1.5Z" fill="#ffe7a4"/></g>
</defs>
<!-- A complete island world, painted in shallow illustrated layers. -->
<rect width="800" height="600" fill="url(#sky)"/>
<ellipse cx="348" cy="179" rx="237" ry="174" fill="url(#sun)"/>
<circle cx="361" cy="186" r="44" fill="#fff3ba" opacity=".8"/>
<use href="#cloud" transform="translate(317 121)scale(.85)" opacity=".65"/><use href="#cloud" transform="translate(505 76)scale(1.35)" opacity=".55"/>
<use href="#cloud" transform="translate(71 200)scale(.8)" opacity=".65"/><use href="#cloud" transform="translate(396 222)scale(.6)" opacity=".7"/>
<path d="M0 256Q93 226 169 241Q210 220 245 247L283 205L310 194L332 213L350 227L385 233L418 266L502 240L552 235L600 255L684 233L800 239V410H0Z" fill="url(#farIsland)" opacity=".72"/>
<path d="M215 259L279 212L308 195L336 231L356 226L385 250L421 269Z" fill="#80afa1"/>
<path d="M284 214L309 197L324 214L313 208L308 212L299 208Z" fill="#e6dfb4"/>
<path d="M303 188C288 166 313 155 302 142C331 150 314 171 323 184" fill="none" stroke="#e6f2d4" stroke-width="8" opacity=".5"/>
<rect y="274" width="800" height="326" fill="url(#sea)"/>
<path d="M0 294Q76 282 158 294T308 295T478 293T672 297T830 289M25 316Q112 308 207 320M259 326Q347 316 409 326M377 283L465 283M197 304L274 304M88 337L161 337" class="fine" stroke="#c9eed7" stroke-width="2" opacity=".55"/>
<!-- Distant cliffs and a ribbon waterfall. -->
<path d="M39 253L103 219L160 225L188 247L186 293L159 325L106 336L50 319L25 283Z" fill="url(#rock)"/>
<path d="M25 255Q62 228 102 215L139 220L158 210L179 226L193 244L171 257L127 248L87 264L56 262L28 272Z" fill="url(#grass)"/>
<path d="M117 248Q126 255 117 289Q112 316 129 335L150 336Q130 307 140 277Q147 253 134 247Z" fill="url(#waterfall)"/>
<path d="M127 258Q131 282 126 300M129 310L139 329" class="fine" stroke="#f6fff1" stroke-width="2"/>
<ellipse cx="139" cy="339" rx="43" ry="8" fill="#b5e9d8" opacity=".7"/><ellipse cx="143" cy="345" rx="61" ry="4" fill="#a7e0d0" opacity=".4"/>
<path d="M57 274L69 280L63 306M162 270L156 287L169 296M93 291L91 317" class="fine" stroke="#658d72" stroke-width="3" opacity=".7"/>
<use href="#palm" transform="translate(73 213)scale(.42)rotate(-8)"/><use href="#palm" transform="translate(161 211)scale(.3)rotate(10)"/>
<!-- Jungle entrance at right. This stays visually quiet for the live login UI. -->
<path d="M575 0H800V600H409L422 453L464 377L473 316L501 247L516 158L545 74Z" fill="url(#jungle)"/>
<path d="M671-45Q645 55 675 147Q697 219 662 310Q629 420 649 610H722Q691 446 722 330Q761 228 720 123Q697 55 733-21Z" fill="#285d4d"/>
<path d="M681-24Q661 82 697 164Q717 221 688 315Q658 441 682 600" class="fine" stroke="#578468" stroke-width="6" opacity=".4"/>
<path d="M764-20Q741 76 768 177Q788 247 765 324L800 343V0Z" fill="#143f3b"/>
<path d="M518 307Q561 273 579 205L596 132L641 100L670 25" class="fine" stroke="#294f3f" stroke-width="16"/>
<path d="M514 315Q553 287 577 210M588 176L600 130L644 102" class="fine" stroke="#638163" stroke-width="3" opacity=".45"/>
<path d="M601-10C610 58 563 97 575 147C588 191 548 231 565 276" class="fine" stroke="#50846b" stroke-width="4"/>
<path d="M604-7C612 57 570 100 582 145C594 189 554 229 570 270" class="fine" stroke="#233f37" stroke-width="1.5"/>
<path d="M475 302Q540 285 564 325L551 506L436 512Z" fill="#2c6556" opacity=".55"/>
<path d="M560 304L577 292L586 335L574 369L595 412L585 485L560 507L544 477L551 437L537 398L546 354Z" fill="#56846a" opacity=".25"/>
<path d="M600 311L636 318M609 344L633 338M603 392L640 388M609 451L629 446" class="fine" stroke="#73a185" stroke-width="1.2" opacity=".12"/>
<rect x="412" y="128" width="388" height="472" fill="url(#formShade)"/>
<!-- Curved cliff foreground, dotted with little flowers and ancient stones. -->
<path d="M-34 462Q32 410 92 421Q151 407 212 426Q249 408 298 422Q354 408 405 433Q468 446 491 494L477 602H0Z" fill="url(#rock)" stroke="#315d47" stroke-width="3"/>
<path d="M-25 462Q30 418 91 425Q146 410 210 433Q249 414 295 429Q354 414 406 440Q441 445 465 465Q404 454 375 470Q344 463 316 475Q280 464 239 475Q194 453 150 467Q101 451 73 468Q37 461-13 488Z" fill="url(#grass)"/>
<path d="M38 487L62 511L49 555M111 481L120 513L99 544L111 600M219 492L198 522L211 553L206 600M356 477L343 509L361 533L350 577M430 485L418 535L436 564" class="fine" stroke="#536e55" stroke-width="4" opacity=".45"/>
<path d="M61 512L84 511M120 513L140 523M201 527L175 539M342 508L311 503M418 532L393 540" class="fine" stroke="#d6bf88" stroke-width="2" opacity=".5"/>
<ellipse cx="232" cy="506" rx="200" ry="26" fill="#244e3e" opacity=".23"/>
<!-- Ancient stone idol, partially hidden at the shoreline. -->
<g transform="translate(400 368)rotate(5)" opacity=".92"><path d="M-18-38L16-44L31-26L25 64L-22 67L-33 51L-29-18Z" fill="url(#stone)" stroke="#4b6c56" stroke-width="3"/><path d="M-21-17L0-25L22-18L16 15L-17 19Z" fill="#7d9c7f"/><path d="M-19-9L-7-11L-6-1L-18 1M7-13L17-13L16-3L7-2" fill="#244e43"/><path d="M-6 12L6 9L4 23L-4 24M-14 35L14 31L10 42L-11 46" fill="none" stroke="#53715b" stroke-width="4"/><path d="M-23-25L-10-29M19-32L22-25M-18 55L8 51" stroke="#e9deb1" stroke-width="2"/></g>
<!-- Hero's spear is behind the figure. -->
<g transform="rotate(11 320 375)"><path d="M319 211L321 491" stroke="#284b3e" stroke-width="9" stroke-linecap="round"/><path d="M318 216L320 488" stroke="#c19158" stroke-width="5" stroke-linecap="round"/><path d="M319 217L302 195L318 164L335 194Z" fill="url(#stone)" class="edge"/><path d="M318 171L314 193L320 211L327 195Z" fill="#edf1cc"/><path d="M313 213L326 211M313 220L326 218M313 227L326 225" stroke="#e7d8a5" stroke-width="3"/></g>
<!-- The returning young hero: hand-drawn silhouette, warm face, fur and turquoise charm. -->
<g filter="url(#shadow)">
  <path d="M229 377Q211 402 218 440L229 459L249 455L253 414L271 449L294 439L276 389Z" fill="url(#skin)" class="edge"/>
  <path d="M218 437L214 462Q208 470 208 483Q222 494 242 483L246 452L232 458Z" fill="url(#leather)" class="edge"/>
  <path d="M270 436L279 465L273 481Q290 489 309 474Q307 464 296 459L291 436Z" fill="url(#leather)" class="edge"/>
  <path d="M214 454L232 461L247 449L243 465L231 469L215 463Z" fill="url(#fur)" class="ink"/>
  <path d="M273 438L287 446L294 439L297 450L287 456L277 448Z" fill="url(#fur)" class="ink"/>
  <path d="M217 476Q225 480 239 475M282 475L299 469" class="fine" stroke="#c79a67" stroke-width="2"/>
  <path d="M222 355L269 352L280 394L262 407L248 393L231 404L214 390Z" fill="url(#leather)" class="edge"/>
  <path d="M220 364L271 361L273 371L219 375Z" fill="#544b37" class="ink"/><rect x="241" y="360" width="14" height="14" rx="3" fill="#d9c578" stroke="#715f3c" stroke-width="2"/>
  <path d="M246 365L251 365L251 369L246 370" fill="none" stroke="#766941" stroke-width="2"/>
  <!-- arms -->
  <path d="M220 306Q205 315 197 339L185 359Q186 370 199 371Q211 362 214 350L230 333Z" fill="url(#skin)" class="edge"/>
  <path d="M193 352Q177 353 175 363Q173 374 185 376Q197 379 202 370L205 363" fill="url(#skin)" class="ink"/>
  <path d="M266 308Q284 315 286 333L299 330L309 309Q320 305 323 316Q319 339 307 345Q285 353 271 341Z" fill="url(#skin)" class="edge"/>
  <path d="M307 310Q302 300 307 294Q311 291 315 300L318 310M317 311Q314 295 320 295Q326 296 325 313Q326 323 318 325" fill="url(#skin)" class="ink"/>
  <!-- torso and furry collar -->
  <path d="M225 298L258 296Q270 304 271 326L269 358L245 365L220 357L217 325Z" fill="url(#fur)" class="edge"/>
  <path d="M223 316L226 351M259 324L255 352" class="fine" stroke="#bd9667" stroke-width="2"/>
  <path d="M222 296L228 284L253 284L266 297L273 301L266 309L269 315L257 312L253 319L244 313L236 320L231 312L219 317L220 309L212 307Z" fill="#f8e6af" class="ink"/>
  <path d="M229 303Q239 328 256 302" class="fine" stroke="#6a634b" stroke-width="2.5"/>
  <path d="M243 319L249 312L256 319L252 331L244 329Z" fill="#57bab0" stroke="#326966" stroke-width="2"/><path d="M247 317L246 325" stroke="#c0f4d5" stroke-width="2"/>
  <path d="M223 332L265 342L264 349L223 339Z" fill="#926145" class="ink"/>
  <!-- head -->
  <path d="M222 267L226 296Q239 308 253 296L260 273Z" fill="url(#skin)" class="ink"/>
  <path d="M214 237Q199 252 207 274Q214 294 237 295Q258 296 269 278Q281 256 265 237Z" fill="url(#skin)" class="edge"/>
  <path d="M212 258Q198 246 195 259Q192 269 208 273M266 262Q281 252 281 265Q280 275 269 275" fill="url(#skin)" class="ink"/>
  <path d="M198 258Q201 257 205 263M275 263L272 268" class="fine" stroke="#b77f5c" stroke-width="1.5"/>
  <path d="M214 254Q220 248 228 252M247 252Q254 248 261 253" class="fine" stroke="#7c4f37" stroke-width="3"/>
  <ellipse cx="223" cy="262" rx="7.3" ry="10.2" fill="#fff8df"/>
  <ellipse cx="252" cy="262" rx="7.3" ry="10.2" fill="#fff8df"/>
  <ellipse cx="225" cy="264" rx="4.4" ry="7" fill="#347e6b"/><ellipse cx="254" cy="264" rx="4.4" ry="7" fill="#347e6b"/>
  <ellipse cx="226" cy="265" rx="2.2" ry="5" fill="#1d4037"/><ellipse cx="255" cy="265" rx="2.2" ry="5" fill="#1d4037"/>
  <circle cx="223" cy="260" r="2.1" fill="white"/><circle cx="252" cy="260" r="2.1" fill="white"/>
  <path d="M237 264L234 274L241 276" class="fine" stroke="#c68f61" stroke-width="1.8"/>
  <ellipse cx="215" cy="275" rx="7" ry="3" fill="#d58d6e" opacity=".5"/><ellipse cx="259" cy="275" rx="6" ry="3" fill="#d58d6e" opacity=".5"/>
  <path d="M228 281Q240 289 250 279Q244 296 232 288Z" fill="#864d40" stroke="#8d5842" stroke-width="1.5"/><path d="M232 282Q240 285 247 281" stroke="#fff0d1" stroke-width="3" stroke-linecap="round"/>
  <!-- shaggy, windblown hair -->
  <path d="M205 262L194 248L202 244L194 230L210 232L210 215L222 223L236 207L244 218L258 209L261 222L275 219L270 233L283 240L270 248L270 266L261 259L257 241L247 249L247 234L233 247L232 233L220 246L215 237L212 261Z" fill="url(#hair)" class="edge"/>
  <path d="M211 234L218 226M226 233L237 220M249 228L256 221M263 234L270 231" class="fine" stroke="#f8bd70" stroke-width="3"/>
  <path d="M205 247L205 256M269 246L267 255" class="fine" stroke="#8f472f" stroke-width="2"/>
  <path d="M205 244Q230 230 270 241" class="fine" stroke="#387d72" stroke-width="6"/><path d="M209 242Q234 233 266 240" class="fine" stroke="#73b4a0" stroke-width="2"/>
  <path d="M234 235L241 232L247 236L242 242L235 241Z" fill="#f6d18a" stroke="#805f41" stroke-width="1.7"/>
  <path d="M206 245L197 254L190 249L194 266L207 251" fill="#4c9d8a" class="ink"/>
</g>
<!-- Friendly moss-green dinosaur: a rounded silhouette, expressive amber eye, little claws. -->
<g filter="url(#shadow)">
  <path d="M120 444Q70 435 51 403Q38 381 43 365Q13 401 34 438Q60 482 116 478Z" fill="url(#dino)" class="edge"/>
  <path d="M43 374L39 399M49 415L58 426M69 438L84 443" class="fine" stroke="#cae58c" stroke-width="5"/>
  <path d="M77 433L65 439L74 446M53 416L42 420L48 429M36 393L28 400L34 406" fill="#e5b76c" class="ink"/>
  <path d="M128 361Q178 348 207 383Q237 422 215 465Q194 499 143 497Q94 499 89 460Q82 414 113 385Z" fill="url(#dino)" class="edge"/>
  <path d="M172 390Q209 394 214 428Q221 466 187 481Q155 493 141 466Q125 430 145 402Z" fill="url(#belly)" stroke="#6b9a60" stroke-width="2"/>
  <path d="M148 423Q179 434 210 425M144 438Q176 450 210 441M149 454Q175 467 203 457" class="fine" stroke="#c1af78" stroke-width="1.7"/>
  <path d="M113 457Q100 480 102 498Q82 504 84 514Q104 526 132 514L141 488Z" fill="url(#dino)" class="edge"/>
  <path d="M181 471Q175 495 185 508Q199 524 229 511Q238 505 226 498L212 495L213 477Z" fill="url(#dino)" class="edge"/>
  <path d="M92 514Q92 502 99 504L105 515M110 516Q111 504 118 505L123 514M196 513Q194 502 201 503L207 514M213 512Q211 502 217 501L223 510" fill="#f4e5b4" stroke="#547752" stroke-width="1.6"/>
  <!-- left little arm and lifted right paw -->
  <path d="M111 400Q86 408 87 432Q92 446 108 434L121 416" fill="url(#dino)" class="edge"/>
  <path d="M204 398Q221 388 230 365Q236 357 242 366Q249 381 232 406L214 422" fill="url(#dino)" class="edge"/>
  <path d="M230 371L229 362Q232 353 237 362L239 370M240 373Q248 366 248 374L243 382" fill="#f4e5b4" class="ink"/>
  <ellipse cx="103" cy="414" rx="8" ry="11" fill="#64af64" opacity=".7"/>
  <!-- backbone plates -->
  <path d="M107 397L96 388L110 382L106 368L120 367L123 353L136 358L145 345L154 359" fill="#ecba72" class="ink"/>
  <path d="M116 364L124 357M106 383L111 379M147 351L150 357" class="fine" stroke="#ffe0a2" stroke-width="2"/>
  <!-- head -->
  <path d="M115 341Q118 306 157 301Q192 296 213 319Q236 327 236 351Q245 379 222 394Q204 410 164 402Q134 402 122 384Q105 366 115 341Z" fill="url(#dinoFace)" class="edge"/>
  <path d="M129 337Q125 318 151 315" class="fine" stroke="#edffb5" stroke-width="6" opacity=".75"/>
  <path d="M155 305L150 294L163 291L174 305M181 308L185 296L199 302L197 317" fill="#eec584" class="ink"/>
  <ellipse cx="176" cy="338" rx="18" ry="23" fill="#f6f4c8" stroke="#507a4b" stroke-width="2.3"/>
  <ellipse cx="182" cy="340" rx="11.3" ry="17" fill="url(#eye)"/><ellipse cx="185" cy="341" rx="5.2" ry="13" fill="#23443b"/>
  <ellipse cx="182" cy="332" rx="4" ry="6" fill="#fffde9"/><circle cx="187" cy="346" r="2" fill="#f7eab6"/>
  <path d="M160 317Q176 308 191 318" class="fine" stroke="#5b864c" stroke-width="5"/>
  <path d="M192 350Q214 332 231 346Q246 353 240 368Q239 382 220 385L193 380" fill="url(#dinoFace)" stroke="#46764e" stroke-width="2.7"/>
  <ellipse cx="223" cy="353" rx="3" ry="4" fill="#487853" transform="rotate(-18 223 353)"/>
  <path d="M169 376Q196 391 227 376Q220 402 194 398Q174 394 169 376Z" fill="#416c4b" stroke="#3b6a49" stroke-width="2"/>
  <path d="M178 381L182 388L188 385M216 382L215 389L209 386" fill="#fff0c4"/>
  <path d="M188 395Q199 386 211 393L209 398L197 400Z" fill="#d88e75"/>
  <ellipse cx="149" cy="367" rx="10" ry="6" fill="#71b963"/><ellipse cx="137" cy="349" rx="4.5" ry="6" fill="#79bd64"/><ellipse cx="145" cy="334" rx="3.5" ry="4.5" fill="#83c96b"/>
  <path d="M131 389Q142 397 154 397" class="fine" stroke="#dcf39c" stroke-width="3"/>
  <g fill="#408f5d" opacity=".65"><ellipse cx="110" cy="451" rx="7" ry="10"/><ellipse cx="116" cy="430" rx="4" ry="6"/><ellipse cx="126" cy="447" rx="4" ry="5"/><ellipse cx="99" cy="470" rx="3" ry="5"/></g>
  <!-- adventurous little scarf -->
  <path d="M129 390Q148 414 182 409L178 422Q148 425 129 407L119 414L116 400Z" fill="#dc9357" class="ink"/>
  <path d="M129 405L127 432L143 423L139 414" fill="#d37f45" class="ink"/><path d="M136 405Q155 417 175 414" class="fine" stroke="#f2c17f" stroke-width="2"/>
</g>
<!-- Companion's pack and a tiny hatchling near the hero. -->
<g transform="translate(332 465)rotate(-9)" filter="url(#shadow)">
  <path d="M-23-17Q-23-39 0-40Q27-40 28-16L29 20L-26 23Z" fill="#c9995d" class="edge"/><path d="M-27-20Q0-30 31-17L28-2L-24 0Z" fill="#e5c58a" class="ink"/><path d="M-2-23L9-22L9 4L-2 6Z" fill="#7d6847" class="ink"/><rect x="-5" y="-4" width="17" height="11" rx="3" fill="#d0ae68" class="ink"/>
  <path d="M-20 6L-15 17M19 3L21 16" class="fine" stroke="#9d7547" stroke-width="2"/>
  <path d="M-24-24L-35-38L-31-47L-17-29M23-24L35-44L42-42L33-21" fill="#e1d7ad" class="ink"/>
</g>
<g transform="translate(354 433)" filter="url(#shadow)">
  <path d="M-16 17Q-28 28-15 38Q1 44 16 35Q25 24 12 16Z" fill="#d5a768" class="ink"/>
  <path d="M-22 3Q-17-19 5-15Q28-12 25 9Q22 29 2 28Q-21 29-22 3Z" fill="#eed7a0" class="ink"/>
  <path d="M-18-8L-28-14L-19-20L-11-12M0-15L1-27L9-25L10-14M17-9L28-14L31-6L22 2" fill="#dfad72" class="ink"/>
  <path d="M-17 1Q-12-6-6 0M9 0Q15-6 20 2" class="fine" stroke="#6b6346" stroke-width="2.3"/>
  <path d="M-2 7L2-2L8 6Z" fill="#f9ecc4" class="ink"/><path d="M-6 16Q3 22 13 15" class="fine" stroke="#8a7352" stroke-width="2"/>
  <ellipse cx="-13" cy="12" rx="5" ry="3" fill="#d99c70" opacity=".6"/><ellipse cx="19" cy="12" rx="4" ry="3" fill="#d99c70" opacity=".6"/>
  <path d="M-14 36L-20 42M8 37L13 42" stroke="#6c7550" stroke-width="5" stroke-linecap="round"/>
</g>
<!-- Small pterosaur leads the eye toward the island, never into the form. -->
<g transform="translate(390 203)rotate(-8)">
  <path d="M0 0Q-23-34-63-29L-42-9L-23-12L-10 8M8 0Q34-32 64-13L42-6L26 2L18 13" fill="#68b8af" stroke="#3e7b73" stroke-width="2.2"/>
  <path d="M-8 4Q-18-13-8-20Q3-26 13-15L25-8L12-4Q22 19 6 26Q-8 22-8 4Z" fill="#a4d6b6" stroke="#3e7b73" stroke-width="2.2"/>
  <path d="M-6-18L-16-30L3-24L7-19" fill="#f2c37c" stroke="#3e7b73" stroke-width="2"/><circle cx="7" cy="-14" r="2.3" fill="#1e5048"/><circle cx="7.5" cy="-15" r=".8" fill="white"/>
  <path d="M2 20L-7 37L8 31L12 22" fill="#76b9a3" stroke="#3e7b73" stroke-width="2"/>
</g>
<!-- Vegetation frames the characters like a modern illustrated storybook cover. -->
<g opacity=".85"><use href="#bigLeaf" transform="translate(-3 116)rotate(95)scale(1.5)"/><use href="#bigLeaf" transform="translate(20 116)rotate(135)scale(1.4)"/><use href="#bigLeaf" transform="translate(7 185)rotate(160)scale(1.45)"/></g>
<g transform="translate(13 543)"><use href="#bigLeaf" transform="rotate(-45)scale(1.25)"/><use href="#bigLeaf" transform="translate(11 4)rotate(15)scale(.95)"/><use href="#bigLeaf" transform="translate(5 18)rotate(70)scale(1.5)"/><use href="#fern" transform="translate(28 6)rotate(-15)scale(1.1)"/></g>
<g transform="translate(421 563)"><use href="#bigLeaf" transform="rotate(-60)scale(1.2)"/><use href="#bigLeaf" transform="rotate(2)scale(1.25)"/><use href="#bigLeaf" transform="translate(7 8)rotate(60)scale(.95)"/><use href="#fern" transform="translate(-15 14)rotate(-10)scale(.9)"/></g>
<path d="M0 571Q100 551 194 572T396 568T590 569T800 552V600H0Z" fill="#0c3b35"/>
<use href="#fern" transform="translate(63 602)rotate(-28)scale(1.25)"/><use href="#fern" transform="translate(382 605)rotate(20)scale(1.3)"/>
<use href="#bigLeaf" transform="translate(787 604)rotate(32)scale(2)"/><use href="#bigLeaf" transform="translate(802 572)rotate(-42)scale(1.65)"/>
<use href="#flower" transform="translate(39 529)scale(.85)"/><use href="#flower" transform="translate(410 533)scale(.75)"/><use href="#flower" transform="translate(369 573)scale(.55)"/>
<g fill="#e4ce8b"><ellipse cx="67" cy="496" rx="2" ry="3"/><ellipse cx="79" cy="483" rx="1.5" ry="2.5"/><ellipse cx="306" cy="520" rx="2" ry="3"/><ellipse cx="323" cy="514" rx="1.5" ry="2.5"/></g>
<!-- Hanging leaves in the upper corners, carefully away from all title lettering. -->
<g transform="translate(784 90)"><use href="#bigLeaf" transform="rotate(-70)scale(1.3)"/><use href="#bigLeaf" transform="rotate(-25)scale(1.5)"/><use href="#bigLeaf" transform="rotate(30)scale(1.3)"/><use href="#bigLeaf" transform="rotate(77)scale(1.2)"/></g>
<g transform="translate(617 6)"><use href="#bigLeaf" transform="rotate(-120)scale(1.3)"/><use href="#bigLeaf" transform="rotate(-176)scale(1.1)"/><use href="#bigLeaf" transform="rotate(130)scale(1.1)"/></g>
<path d="M713 12Q681 35 687 74Q690 99 677 122M738 15Q733 78 757 105Q776 130 762 153" class="fine" stroke="#558d68" stroke-width="3"/>
<g fill="#b4c67e" opacity=".6"><ellipse cx="678" cy="120" rx="4" ry="7" transform="rotate(30 678 120)"/><ellipse cx="762" cy="152" rx="4" ry="7" transform="rotate(-20 762 152)"/></g>
<rect y="507" width="800" height="93" fill="url(#bottomShade)"/>
<rect width="800" height="600" fill="url(#vignette)" pointer-events="none"/>
<!-- Original StoneAge wordmark; the portable font is embedded and rasterized. -->
<g filter="url(#logoShadow)" transform="rotate(-3 235 91)">
 <text x="43" y="112" font-family="StoneLogo" font-size="76" font-weight="bold" letter-spacing="-5" fill="#0e4b45" stroke="#0c413c" stroke-width="11" paint-order="stroke">StoneAge</text>
 <text x="43" y="108" font-family="StoneLogo" font-size="76" font-weight="bold" letter-spacing="-5" fill="url(#logo)" stroke="#f8f2c5" stroke-width="2" paint-order="stroke">StoneAge</text>
 <path d="M90 65L95 69L91 78M172 61L178 66M239 64L235 72M323 76L328 80L324 87M389 75L383 80" class="fine" stroke="#caa168" stroke-width="1.6" opacity=".8"/>
 <path d="M48 119Q224 138 401 123" fill="none" stroke="#f5e1a3" stroke-width="2" opacity=".85"/>
</g>
<g font-family="StoneLogo" fill="#164e48"><text x="57" y="154" font-size="17" letter-spacing=".6">Return of the Heroes</text></g>
<path d="M59 166H105M252 166H296" stroke="#468c75" stroke-width="1.3" opacity=".6"/><path d="M174 164L179 161L184 164L179 168Z" fill="#f3d28b" stroke="#5e957b" stroke-width="1"/>
<use href="#spark" transform="translate(425 90)scale(1.1)"/><use href="#spark" transform="translate(408 132)scale(.55)"/>
<g fill="#f4db92" opacity=".65"><circle cx="471" cy="320" r="1.8"/><circle cx="737" cy="475" r="1.6"/><circle cx="455" cy="465" r="1.6"/><circle cx="657" cy="172" r="1.3"/><circle cx="752" cy="279" r="1.5"/></g>
</svg>'''.replace('FONTDATA', FONT)

# The standalone SVG carries its embedded font's license, not just a sibling file.
SVG = SVG.replace('<defs>', '<metadata><![CDATA[' + (ART / 'FONT-LICENSE.txt').read_text() + ']]></metadata>\n<defs>', 1)
(ART / 'login.svg').write_text(SVG)
with sync_playwright() as p:
    browser = p.chromium.launch(args=['--disable-gpu'])
    page = browser.new_page(viewport={'width': 1280, 'height': 960}, device_scale_factor=1)
    page.goto((ART / 'login.svg').as_uri())
    page.evaluate('document.fonts.ready')
    page.screenshot(path=str(ART / 'login.png'), omit_background=False)
    browser.close()
print(json.dumps({'svg': str(ART/'login.svg'), 'png': str(ART/'login.png'), 'size': [1280,960], 'composition': '800x600 logical; right quiet zone x470..755 y190..470'}, indent=2))
