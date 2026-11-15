// Shared knot SVG illustrations.
(function (api) {
function knotSvg(type, large = false) {
  const common = 'fill="none" stroke="#425b49" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"';
  if (type === "figure-eight") {
    return `<svg viewBox="0 0 360 190" role="img" aria-label="Illustration of a figure-eight stopper knot">
      <path ${common} d="M178 12 C178 42 91 44 91 91 C91 133 144 145 178 105 C212 145 269 133 269 91 C269 44 182 42 182 12"/>
      <path d="M178 105 C150 85 124 73 103 62" fill="none" stroke="#8b9b86" stroke-width="5" stroke-linecap="round"/>
      <path d="M182 105 C210 85 236 73 257 62" fill="none" stroke="#8b9b86" stroke-width="5" stroke-linecap="round"/>
      <path d="M178 12 L178 3 M182 12 L182 3" stroke="#425b49" stroke-width="7" stroke-linecap="round"/>
    </svg>`;
  }
  if (type === "clove-hitch") {
    return `<svg viewBox="0 0 360 190" role="img" aria-label="Illustration of a clove hitch around a post">
      <rect x="150" y="12" width="60" height="166" rx="10" fill="#e8e4d8"/>
      <path ${common} d="M42 42 C105 42 118 48 151 72 C190 101 230 129 317 145 M42 145 C112 145 127 132 151 106 C190 77 230 49 317 42"/>
      <path d="M151 72 C172 89 188 101 210 115 M151 106 C173 90 190 78 210 65" fill="none" stroke="#8b9b86" stroke-width="5" stroke-linecap="round"/>
    </svg>`;
  }
  if (type === "sheet-bend") {
    return `<svg viewBox="0 0 360 190" role="img" aria-label="Illustration of a sheet bend joining two ropes">
      <path ${common} d="M35 45 C90 45 110 45 145 78 C175 106 185 146 145 157 C105 168 88 134 115 103 C145 69 202 56 325 56"/>
      <path d="M35 143 C90 143 115 141 143 116 C171 91 194 76 228 78 C268 80 280 112 325 143" fill="none" stroke="#8b9b86" stroke-width="5" stroke-linecap="round"/>
    </svg>`;
  }
  if (type === "taut-line-hitch") {
    return `<svg viewBox="0 0 360 190" role="img" aria-label="Illustration of a taut-line hitch on a standing rope">
      <path d="M275 12 L275 178" fill="none" stroke="#8b9b86" stroke-width="9" stroke-linecap="round"/>
      <path ${common} d="M70 28 C125 28 165 34 205 54 C245 75 245 96 205 106 C165 116 165 74 205 66 C245 58 245 119 205 130 C165 141 160 100 205 94 C245 88 250 147 275 158"/>
    </svg>`;
  }
  if (type === "timber-hitch") {
    return `<svg viewBox="0 0 360 190" role="img" aria-label="Illustration of a timber hitch around a log">
      <rect x="38" y="72" width="284" height="54" rx="25" fill="#e8e4d8"/>
      <path ${common} d="M24 34 C72 34 95 52 118 72 C139 91 150 109 174 126 C196 142 222 133 218 113 C215 96 191 94 180 109 C169 124 188 140 207 139 C230 138 244 116 231 101 C220 88 199 88 190 101 C180 114 193 128 208 126 C226 123 237 108 226 95 C216 82 198 85 188 98"/>
      <path d="M188 98 C170 91 152 79 139 66 C119 46 91 36 24 34" fill="none" stroke="#8b9b86" stroke-width="5" stroke-linecap="round"/>
    </svg>`;
  }
  if (type === "round-turn-two-half-hitches") {
    return `<svg viewBox="0 0 360 190" role="img" aria-label="Illustration of a round turn and two half hitches around a post">
      <rect x="145" y="10" width="70" height="170" rx="12" fill="#e8e4d8"/>
      <path ${common} d="M35 42 C90 42 115 48 145 70 C190 104 230 142 325 145"/>
      <path d="M35 42 C95 42 118 57 145 82 C190 117 228 151 325 145" fill="none" stroke="#8b9b86" stroke-width="5" stroke-linecap="round"/>
      <path ${common} d="M325 145 C260 143 240 105 214 91 C188 76 190 52 220 49 C250 46 258 73 235 85 C212 97 193 119 220 132 C247 145 267 119 245 105"/>
    </svg>`;
  }
  return `<svg viewBox="0 0 360 190" role="img" aria-label="Illustration of a bowline fixed loop">
    <path ${common} d="M176 10 C176 43 89 36 90 94 C91 153 159 161 178 117 C198 73 147 63 124 88 C102 112 139 141 178 117 C221 91 260 105 260 145"/>
    <path d="M178 117 C211 91 229 64 260 45 C286 29 306 40 305 64 C304 84 283 96 260 88" fill="none" stroke="#8b9b86" stroke-width="5" stroke-linecap="round"/>
    <path d="M176 10 L176 3" stroke="#425b49" stroke-width="7" stroke-linecap="round"/>
  </svg>`;
}
api.knotSvg = knotSvg;
})(window.KRS = window.KRS || {});
