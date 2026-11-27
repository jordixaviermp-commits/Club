#!/usr/bin/env python3
"""Quita del CSS las reglas muertas (y los selectores muertos dentro de una lista). Uso: deadcut.py entrada.css salida.css"""
import re, sys, os, glob
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import importlib.util
_sp = importlib.util.spec_from_file_location('limpiar', os.path.join(os.path.dirname(os.path.abspath(__file__)), 'limpiar-declaraciones.py')); C = importlib.util.module_from_spec(_sp); _sp.loader.exec_module(C)
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))

css = open(sys.argv[1], encoding='utf-8').read()
src = ''
for f in glob.glob(ROOT + '/js/*.js') + glob.glob(ROOT + '/*.html') + [ROOT + '/sw.js'] + glob.glob(ROOT + '/ruta/*') + glob.glob(ROOT + '/pacing/*'):
    if os.path.isfile(f):
        src += open(f, encoding='utf-8', errors='ignore').read() + '\n'
dyn = set(re.findall(r'([A-Za-z0-9_-]+)\$\{', src)) | set(re.findall(r"['\"]([A-Za-z0-9_-]+)['\"]\s*\+", src)) | set(re.findall(r'\+\s*[\'"]([A-Za-z0-9_-]+)[\'"]', src))
dyn = {d for d in dyn if len(d) >= 2}
suf = {x for x in (set(re.findall(r'\$\{[^}]*\}(-[A-Za-z0-9_-]+)', src)) | set(re.findall(r"\+\s*['\"](-[A-Za-z0-9_-]+)['\"]", src)) | set(re.findall(r"['\"](-[A-Za-z0-9_-]+)['\"]\s*\)", src))) if len(x) >= 3}
words = set(re.findall(r'[A-Za-z0-9_-]+', src))


def live(tok):
    if tok in words or tok in src: return True
    if any(tok.startswith(p) for p in dyn): return True
    if any(tok.endswith(x) for x in suf): return True
    parts = tok.split('-')
    for i in range(1, len(parts)):
        pre = '-'.join(parts[:i]) + '-'
        if pre in dyn or (pre in src and ("'" + pre + "'" in src or '`' + pre in src or '"' + pre + '"' in src or pre + '$' in src)): return True
    return False


def sel_dead(s):
    toks = re.findall(r'(?<![\w-])\.([A-Za-z_][\w-]*)', s) + re.findall(r'#([A-Za-z_][\w-]*)', s)
    return any(not live(t) for t in toks)


rules = []; C.parse(css, 0, len(css), (), rules)
cuts = []; whole = 0; partial = 0
for r in rules:
    sels = [s.strip() for s in re.split(r',(?![^()]*\))', css[r['start']:r['open']]) if s.strip()]
    if not sels: continue
    flags = [sel_dead(s) for s in sels]
    if all(flags):
        cuts.append((r['start'], r['close'] + 1, '')); whole += 1
    elif any(flags):
        keep = [s for s, f in zip(sels, flags) if not f]
        cuts.append((r['start'], r['open'], ', '.join(keep) + ' ')); partial += 1
out = css
for s, e, rep in sorted(cuts, reverse=True): out = out[:s] + rep + out[e:]
# @media vacíos (hasta que no queden)
for _ in range(5):
    new = re.sub(r'@(media|supports)[^{}]*\{\s*(/\*.*?\*/\s*)*\}', '', out, flags=re.S)
    if new == out: break
    out = new
out = re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+', '\n\n', out)
open(sys.argv[2], 'w', encoding='utf-8').write(out)
print(f'reglas quitadas: {whole} · selectores recortados en listas: {partial} · {len(css)} → {len(out)} bytes ({100 * (len(css) - len(out)) / len(css):.1f} % menos)')
