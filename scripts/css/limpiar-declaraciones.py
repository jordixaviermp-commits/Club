#!/usr/bin/env python3
"""Limpieza segura del CSS: quita declaraciones que NINGÚN navegador aplica nunca porque otra regla posterior,
con el MISMO selector y el mismo contexto (@media), vuelve a poner esa misma propiedad con igual o mayor importancia.
Conserva comentarios y formato. Uso: clean.py entrada.css salida.css"""
import re, sys

SHORT = {
    'padding': ['padding-top', 'padding-right', 'padding-bottom', 'padding-left', 'padding-inline', 'padding-block', 'padding-inline-start', 'padding-inline-end', 'padding-block-start', 'padding-block-end'],
    'margin': ['margin-top', 'margin-right', 'margin-bottom', 'margin-left', 'margin-inline', 'margin-block', 'margin-inline-start', 'margin-inline-end', 'margin-block-start', 'margin-block-end'],
    'border-radius': ['border-top-left-radius', 'border-top-right-radius', 'border-bottom-left-radius', 'border-bottom-right-radius'],
    'gap': ['row-gap', 'column-gap'],
    'inset': ['top', 'right', 'bottom', 'left'],
    'flex': ['flex-grow', 'flex-shrink', 'flex-basis'],
    'overflow': ['overflow-x', 'overflow-y'],
    'background': ['background-color', 'background-image', 'background-position', 'background-size', 'background-repeat', 'background-attachment', 'background-origin', 'background-clip'],
    'border': ['border-width', 'border-style', 'border-color', 'border-top', 'border-right', 'border-bottom', 'border-left', 'border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width', 'border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style', 'border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    'border-width': ['border-top-width', 'border-right-width', 'border-bottom-width', 'border-left-width'],
    'border-style': ['border-top-style', 'border-right-style', 'border-bottom-style', 'border-left-style'],
    'border-color': ['border-top-color', 'border-right-color', 'border-bottom-color', 'border-left-color'],
    'border-top': ['border-top-width', 'border-top-style', 'border-top-color'],
    'border-right': ['border-right-width', 'border-right-style', 'border-right-color'],
    'border-bottom': ['border-bottom-width', 'border-bottom-style', 'border-bottom-color'],
    'border-left': ['border-left-width', 'border-left-style', 'border-left-color'],
    'outline': ['outline-width', 'outline-style', 'outline-color'],
    'text-decoration': ['text-decoration-line', 'text-decoration-style', 'text-decoration-color', 'text-decoration-thickness'],
    'transition': ['transition-property', 'transition-duration', 'transition-timing-function', 'transition-delay'],
}
UNSAFE = re.compile(r'\b(dvh|svh|lvh|dvw|svw|lvw)\b|\d(dvh|svh|lvh)')   # valores «modernos» que pueden ser un refuerzo de otro anterior


def skip_ws_comments(t, i):
    n = len(t)
    while i < n:
        if t[i].isspace():
            i += 1
        elif t.startswith('/*', i):
            j = t.find('*/', i + 2)
            i = n if j < 0 else j + 2
        else:
            break
    return i


def scan_block_end(t, i):
    """i apunta a '{'. Devuelve el índice del '}' que lo cierra (respeta cadenas, comentarios y paréntesis)."""
    depth = 0; n = len(t); q = None; par = 0
    while i < n:
        c = t[i]
        if q:
            if c == '\\': i += 2; continue
            if c == q: q = None
        elif t.startswith('/*', i):
            j = t.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        elif c in '"\'': q = c
        elif c == '(': par += 1
        elif c == ')': par = max(0, par - 1)
        elif par == 0 and c == '{': depth += 1
        elif par == 0 and c == '}':
            depth -= 1
            if depth == 0: return i
        i += 1
    raise ValueError('bloque sin cerrar')


def read_prelude(t, i):
    """Lee hasta '{' o ';' fuera de cadenas/paréntesis. Devuelve (fin, terminador)."""
    n = len(t); q = None; par = 0
    while i < n:
        c = t[i]
        if q:
            if c == '\\': i += 2; continue
            if c == q: q = None
        elif t.startswith('/*', i):
            j = t.find('*/', i + 2); i = n if j < 0 else j + 2; continue
        elif c in '"\'': q = c
        elif c == '(': par += 1
        elif c == ')': par = max(0, par - 1)
        elif par == 0 and c in '{;': return i, c
        i += 1
    return n, ''


def split_decls(t, a, b):
    """Parte t[a:b] (cuerpo de una regla) en declaraciones: [(ini, fin_con_punto_y_coma, prop, valor, importante)]."""
    out = []; i = a; start = a; q = None; par = 0
    def emit(s, e):
        raw = re.sub(r'/\*.*?\*/', '', t[s:e], flags=re.S).strip().rstrip(';').strip()
        if ':' not in raw: return
        prop, val = raw.split(':', 1)
        prop = prop.strip().lower(); val = val.strip()
        imp = bool(re.search(r'!\s*important\s*$', val, re.I))
        val = re.sub(r'\s*!\s*important\s*$', '', val, flags=re.I).strip()
        if prop and not prop.startswith('@'): out.append((s, e, prop, val, imp))
    while i < b:
        c = t[i]
        if q:
            if c == '\\': i += 2; continue
            if c == q: q = None
        elif t.startswith('/*', i):
            j = t.find('*/', i + 2); i = b if j < 0 else j + 2; continue
        elif c in '"\'': q = c
        elif c == '(': par += 1
        elif c == ')': par = max(0, par - 1)
        elif par == 0 and c == ';':
            emit(start, i + 1); start = i + 1
        i += 1
    if start < b: emit(start, b)
    return out


def parse(t, a, b, ctx, rules):
    i = a
    while True:
        i = skip_ws_comments(t, i)
        if i >= b: break
        end, term = read_prelude(t, i)
        prelude = re.sub(r'\s+', ' ', re.sub(r'/\*.*?\*/', '', t[i:end], flags=re.S)).strip()
        if term == ';' or term == '':
            i = end + 1; continue
        close = scan_block_end(t, end)
        if prelude.startswith('@'):
            name = prelude[1:].split()[0].split('(')[0].lower() if len(prelude) > 1 else ''
            if name in ('media', 'supports', 'layer', 'container'):
                parse(t, end + 1, close, ctx + (prelude,), rules)
            # keyframes / font-face / page: se dejan tal cual
        else:
            rules.append({'ctx': ctx, 'sel': prelude, 'start': i, 'open': end, 'close': close, 'decls': split_decls(t, end + 1, close)})
        i = close + 1


def overridden(d1, later):
    """¿Alguna declaración posterior anula siempre a d1?"""
    _, _, p1, v1, i1 = d1
    for (_, _, p2, v2, i2) in later:
        if i1 and not i2: continue
        if UNSAFE.search(v2): continue
        if p2 == p1 or (p2 in SHORT and p1 in SHORT[p2]): return True
    return False


def clean(t):
    rules = []; parse(t, 0, len(t), (), rules)
    groups = {}
    for idx, r in enumerate(rules): groups.setdefault((r['ctx'], r['sel']), []).append(idx)
    cuts = []   # (ini, fin)
    removed = 0
    for key, idxs in groups.items():
        if len(idxs) < 2: continue
        for k, ri in enumerate(idxs[:-1]):
            r = rules[ri]
            later = [d for rj in idxs[k + 1:] for d in rules[rj]['decls']]
            keep = []; drop = []
            for d in r['decls']:
                (drop if overridden(d, later) else keep).append(d)
            if not drop: continue
            removed += len(drop)
            if not keep:
                cuts.append((r['start'], r['close'] + 1))
            else:
                for d in drop: cuts.append((d[0], d[1]))
    # aplica los cortes de atrás hacia delante
    cuts.sort(reverse=True)
    last = None
    for s, e in cuts:
        if last is not None and e > last: e = last   # evita solapes
        if s >= e: continue
        t = t[:s] + t[e:]; last = s
    return t, removed, len(rules)


if __name__ == '__main__':
    src = open(sys.argv[1], encoding='utf-8').read()
    out = src; total = 0
    for rnd in range(1, 6):
        out, removed, nrules = clean(out)
        total += removed
        print(f'ronda {rnd}: {removed} declaraciones quitadas ({nrules} reglas)')
        if not removed: break
    # reglas vacías y líneas en blanco sobrantes
    out = re.sub(r'[^{}]*\{\s*\}', lambda m: '' if not m.group(0).lstrip().startswith('@') else m.group(0), out) if False else out
    out = re.sub(r'\n{3,}', '\n\n', out)
    open(sys.argv[2], 'w', encoding='utf-8').write(out)
    print(f'antes {len(src)} bytes · después {len(out)} bytes · ahorro {len(src) - len(out)} ({100 * (len(src) - len(out)) / len(src):.1f} %) · {total} declaraciones')
