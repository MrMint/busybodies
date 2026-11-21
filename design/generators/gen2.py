#!/usr/bin/env python3
"""Busybodies pilots, round 2: generates bb.css and the round-2 artboards, plus preview copies."""
import json, math, os, shutil, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PILOTS = os.path.dirname(HERE)
PROJ = os.path.join(PILOTS, 'boards')
PREV = os.path.join(PILOTS, 'preview')
FONT = ('<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,500;12..96,700;12..96,800'
        '&amp;family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&amp;display=swap">')

# ---------------------------------------------------------------- generated css
ARMS = {  # left shoulder, left elbow, (held-item swing); the right arm is the mirror
    'out': (85, 0), 'up': (165, 0), 'hi': (176, 0), 'wave1': (140, 45), 'wave2': (140, -35), 'hip': (55, -125),
    'chin': (-15, -100), 'face': (-20, -150), 'head': (160, 60), 'cheer': (150, -25), 'hold': (10, -60),
    'type1': (-10, -60), 'type2': (-5, -85), 'type3': (-20, -100), 'cross': (-32, -52), 'cross2': (-26, -66),
    'point': (100, 0), 'sip': (-30, -135), 'palm': (-120, 0), 'throw2': (70, 0), 'ham1': (150, 40),
    'ham2': (62, -20, -75), 'shrug': (60, 60), 'low': (30, 10), 'carry': (-15, -75), 'raise': (70, 80),
    'five': (150, -10), 'phone': (-5, -75),
}


def hand(s, e):
    sx, sy = 3.75, 11.75
    ex, ey = sx - 2.6 * math.sin(math.radians(s)), sy + 2.6 * math.cos(math.radians(s))
    t = math.radians(s + e)
    return round(ex - 2.9 * math.sin(t), 1), round(ey + 2.9 * math.cos(t), 1)


def gen_css():
    o = ['', '/* ---------- generated: arm poses, held items, cameras ---------- */',
         '.pup{--hlr:0deg;--hrr:0deg}',
         '.pup .armL .held{transform:rotate(calc(-1*(var(--sl) + var(--el)) + var(--hlr)))}',
         '.pup .armR .held{transform:rotate(calc(-1*(var(--sr) + var(--er)) + var(--hrr)))}',
         '.bd-nap{--by:2.2em;--br:15deg;--sx:1.07;--sy:.9}',
         '.bg-lan{--bg:#ffc47f}.bg-bre{--bg:#a5e6c9}.bg-orb{--bg:#a6d0ff}.bg-mos{--bg:#ffbdd6}.bg-ket{--bg:#d2c0ff}.bg-kit{--bg:#dfe5f3}.bg-face{--bg:#fff}',
         '.f-up{--ll:-84deg;--lr:-92deg;--ly:-4.4em;--ry:-5.6em}',
         '.f-up .legL,.f-up .legR{z-index:6;height:8em}.f-up .legL::after{left:-.3em}',
         '.fr-pls .front{top:-.8em;height:5.9em}.fr-pls .front::after{font-size:3.2em;line-height:1.42}']
    for n, v in ARMS.items():
        s, e = v[0], v[1]
        h = v[2] if len(v) > 2 else 0
        o.append('.al-%s{--sl:%ddeg;--el:%ddeg;--hlr:%ddeg}.ar-%s{--sr:%ddeg;--er:%ddeg;--hrr:%ddeg}' % (n, s, e, h, n, -s, -e, -h))

    def held(name, parts):
        for k, v in parts.items():
            pre = 'content:"";position:absolute;' if '::' in k and 'content' not in v else ('position:absolute;' if '::' in k else 'display:block;')
            o.append('.hl-%s .armL .%s,.hr-%s .armR .%s{%s%s}' % (name, k, name, k, pre, v))
    stick = 'left:-.35em;top:-5.2em;width:.7em;height:5.4em;background:var(--ink)'
    bfont = '"Bricolage Grotesque","DM Sans",sans-serif'
    held('sign', {'h1': stick, 'h2': 'left:-3.4em;top:-11.4em;width:6.8em;height:6.8em;border-radius:50%;background:var(--sun);border:.55em solid var(--ink)',
                  'h2::after': 'content:"!";inset:0;font:800 4.6em/1.24 %s;text-align:center' % bfont})
    held('ok', {'h1': stick, 'h2': 'left:-3.1em;top:-10.9em;width:6.2em;height:6.2em;border-radius:50%;background:var(--green);border:.55em solid var(--ink)',
                'h3': 'left:-.8em;top:-9.7em;width:1.7em;height:3em;border-right:.75em solid var(--ink);border-bottom:.75em solid var(--ink);transform:rotate(40deg)'})
    held('trophy', {'h1': 'left:-2.4em;top:-6.8em;width:4.8em;height:4.2em;background:#ffd23f;border:.5em solid var(--ink);border-radius:.4em .4em 2.4em 2.4em;scale:1.3;transform-origin:50% 100%',
                    'h2': 'left:-.4em;top:-2.8em;width:.8em;height:1.6em;background:var(--ink)',
                    'h3': 'left:-1.7em;top:-1.5em;width:3.4em;height:1.3em;background:#ffd23f;border:.4em solid var(--ink);border-radius:.3em'})
    held('mug', {'h1': 'left:-1.6em;top:-3.6em;width:3.2em;height:3.4em;background:#fff;border:.5em solid var(--ink);border-radius:.3em .3em 1em 1em',
                 'h2': 'left:1.3em;top:-2.9em;width:1.6em;height:1.9em;border:.45em solid var(--ink);border-left:0;border-radius:0 1em 1em 0',
                 'h3': 'left:-.5em;top:-5.9em;width:1em;height:1.8em;border-left:.4em solid var(--ink);border-radius:50%;opacity:.45'})
    held('clip', {'h1': 'left:-2.7em;top:-6.6em;width:5.4em;height:7em;background:repeating-linear-gradient(transparent 0 1.1em,#c5cbe0 1.1em 1.4em) 0 1.2em #fff;border:.5em solid var(--ink);border-radius:.5em',
                  'h2': 'left:-1.2em;top:-7.3em;width:2.4em;height:1.3em;background:#8892b0;border:.4em solid var(--ink);border-radius:.4em'})
    held('mag', {'h1': 'left:-.4em;top:-3.4em;width:.8em;height:3.8em;background:var(--ink);border-radius:.3em',
                 'h2': 'left:-3em;top:-8.8em;width:6em;height:6em;border-radius:50%;border:.7em solid var(--ink);background:radial-gradient(circle at 34% 30%,#fff 0 .7em,transparent .75em),rgba(155,227,255,.75)'})
    held('hammer', {'h1': 'left:-.45em;top:-5.8em;width:.9em;height:6.8em;background:#b9793f;border:.25em solid var(--ink);border-radius:.3em',
                    'h2': 'left:-2.5em;top:-7.6em;width:5em;height:2.6em;background:#8892b0;border:.5em solid var(--ink);border-radius:.5em'})
    held('brush', {'h1': 'left:-.4em;top:-5em;width:.8em;height:5.8em;background:#b9793f;border:.22em solid var(--ink);border-radius:.3em',
                   'h2': 'left:-1em;top:-7.6em;width:2em;height:2.9em;background:#ff5c9a;border:.42em solid var(--ink);border-radius:1em 1em .2em .2em'})
    held('map', {'h1': 'left:-3.4em;top:-5.6em;width:6.8em;height:5em;border:.5em solid var(--ink);border-radius:.3em;background:radial-gradient(circle at 70% 40%,#ff6b6b 0 .6em,transparent .65em),linear-gradient(90deg,transparent 32%,rgba(27,33,64,.22) 32% 36%,transparent 36% 64%,rgba(27,33,64,.22) 64% 68%,transparent 68%),#fff3c4'})
    held('torch', {'h1': 'left:-.9em;top:-3.6em;width:1.8em;height:4em;background:var(--ink);border-radius:.4em',
                   'h2': 'left:-3.6em;top:-10em;width:7.2em;height:6.6em;background:linear-gradient(to top,rgba(255,229,0,.95),rgba(255,229,0,.1));clip-path:polygon(40% 100%,60% 100%,100% 0,0 0)'})
    held('phone', {'h1': 'left:-1.4em;top:-4.6em;width:2.8em;height:4.8em;background:var(--ink);border-radius:.6em',
                   'h1::after': 'left:.4em;top:.5em;right:.4em;bottom:.9em;background:#9be3ff;border-radius:.2em'})
    pl = 'clip-path:polygon(0 55%,100% 0,64% 100%,52% 62%)'
    held('plane', {'h1': 'left:-3.6em;top:-4.8em;width:7.2em;height:4.4em;background:var(--ink);' + pl,
                   'h2': 'left:-2.7em;top:-4.1em;width:5.4em;height:3em;background:#fff;' + pl})
    held('paper', {'h1': 'left:-1.9em;top:-5em;width:3.8em;height:4.8em;background:repeating-linear-gradient(#fff 0 .8em,#c5cbe0 .8em 1.05em);border:.42em solid var(--ink);border-radius:.25em'})
    held('pom', {'h1': 'left:-2.6em;top:-4.6em;width:5.2em;height:5.2em;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ffe500 0 .7em,transparent .75em),#ff5c9a;border:.6em dotted var(--ink)'})
    return '\n'.join(o) + '\n'


# ---------------------------------------------------------------- puppet markup
def arm(side):
    return ('<span class="arm%s"><span class="fore"><span class="hand"><span class="held"><span class="h1"></span><span class="h2"></span>'
            '<span class="h3"></span></span></span></span></span>' % side)


PARTS = ('<span class="sh"></span><span class="legL"></span><span class="legR"></span><span class="torso"><span class="bean"></span>'
         '<span class="neck"></span><span class="face"><span class="cheekL"></span><span class="cheekR"></span><span class="browL"></span>'
         '<span class="browR"></span><span class="eyeL"></span><span class="eyeR"></span><span class="mouth"></span><span class="acc"></span></span>'
         '<span class="hat"></span><span class="front"></span>' + arm('L') + arm('R') + '</span><span class="dk"></span>'
         '<span class="fx"><span class="f1"></span><span class="f2"></span><span class="f3"></span></span>')


SHAPE = ''
PICK = 's-mochi'
SEAT_UP = {'s-gum': 2.0, 's-chibi': 4.3, 's-mochi': 3.5, 's-pear': 1.8, 's-dump': 2.5}


def pup(role, hole=None, x=None, y=None, fs=None, cls='', z=None, shape=None):
    st = []
    cls = (cls + ' ' + (SHAPE if shape is None else shape)).strip()
    if x is not None:
        st.append('left:%gpx;top:%gpx' % (x, y))
    if fs is not None:
        st.append('font-size:%gpx' % fs)
    if z is not None:
        st.append('z-index:%d' % z)
    c = ' '.join(k for k in ['pup', role, cls, ('{{%s}}' % hole) if hole else ''] if k)
    return '<span class="%s"%s>%s</span>' % (c, (' style="%s"' % ';'.join(st)) if st else '', PARTS)


# ---------------------------------------------------------------- loops: a frame is a class string and a hold, in ticks
def rep(fr, n):
    return list(fr) * n


FL_A = ('e-wide b-worry m-wobble al-up ar-out bd-shakeL x-sweat1', 1)
FL_B = ('e-wide b-worry m-wobble al-out ar-up bd-shakeR x-sweat2', 1)
LOOPS = {
    'frantic': rep([('e-wide b-worry m-flat al-type1 ar-type3 bd-fwd', 1), ('e-wide b-worry m-flat al-type3 ar-type1 bd-fwd x-sweat1', 1)], 3)
    + [('e-wide l-right b-up m-open al-type2 ar-type2 x-papers1', 2), ('e-squint b-angry m-wobble al-type3 ar-type3 bd-fwd x-papers2', 1),
       ('e-wide b-worry m-flat al-type1 ar-type3 bd-fwd x-sweat2', 1), ('e-wide b-worry m-flat al-type3 ar-type1 bd-fwd', 1),
       ('e-closed b-worry m-small hr-mug ar-sip al-type1 bd-tilt', 3)],
    'type': rep([('m-smirk al-type1 ar-type2', 2), ('m-smirk al-type2 ar-type1', 2)], 3) + [('e-happy m-grin al-type1 ar-type1 bd-stretch', 3)],
    'hammer': rep([('e-squint b-angry m-flat hr-hammer ar-ham1 al-hip bd-stretch', 2), ('e-wide m-open hr-hammer ar-ham2 al-hip bd-squash x-pop', 2)], 3)
    + [('e-closed m-open hr-hammer ar-low al-head bd-low x-sweat1', 3), ('e-shine m-grin hr-hammer ar-cheer al-hip', 3)],
    'scout': [('a-binoc m-small al-face ar-face f-wide bd-leanL', 3), ('a-binoc m-small al-face ar-face f-wide bd-leanR', 3),
              ('e-wide b-up m-open hl-map al-raise ar-point l-right', 2), ('e-shine m-grin hl-map al-cheer ar-hip bd-hop', 2)],
    'scoutrun': [('e-wide l-right m-open hl-map al-raise ar-out f-runL bd-leanR', 1), ('e-wide l-right m-flat hl-map al-raise ar-low f-runR bd-hop', 1)],
    'kid': [('e-shine l-right m-open hr-torch ar-raise al-out f-runL', 1), ('e-shine l-right m-grin hr-torch ar-raise al-low f-runR bd-hop', 1)],
    'kidlook': [('e-wide l-left b-up m-small hr-torch ar-raise al-low', 3), ('e-wide l-right b-up m-open hr-torch ar-point al-low', 3),
                ('e-shine m-grin hr-torch ar-cheer al-cheer bd-hop', 2)],
    'verify': [('e-squint l-left b-one m-small hl-mag al-raise ar-hip bd-leanL', 3), ('e-wide l-left b-up m-open hl-mag al-raise ar-hip bd-leanL', 2),
               ('e-happy m-grin hl-mag al-low hr-ok ar-up bd-hop', 3), ('m-smirk hl-mag al-low hr-ok ar-raise', 3)],
    'verifybad': [('e-squint l-left b-one m-small hl-mag al-raise ar-hip bd-leanL', 3), ('e-wide l-left b-worry m-open hl-mag al-raise ar-face', 2),
                  ('e-closed b-worry m-frown hl-mag al-low ar-palm bd-low', 3), ('e-half b-flat m-flat hl-mag al-raise ar-hip', 2)],
    'review': [('e-half l-right b-one m-flat hl-clip al-low ar-point', 3), ('e-squint b-angry m-small hl-clip al-low ar-chin', 3),
               ('e-wide l-right b-up m-open hl-clip al-low ar-point x-idea', 2), ('m-smirk hl-clip al-low ar-hip', 2)],
    'paint': rep([('e-squint l-right m-blep hr-brush ar-raise al-hip bd-leanR', 2), ('e-squint l-right m-blep hr-brush ar-out al-hip bd-leanR', 2)], 2)
    + [('e-half b-one m-small hr-brush ar-low al-chin bd-back', 3), ('e-shine b-up m-grin hr-brush ar-cheer al-cheer bd-hop', 2)],
    'panic': [('e-wide b-up m-open bd-stretch', 2)] + rep([FL_A, FL_B], 3)
    + [('e-tear b-worry m-wobble al-palm ar-low bd-low', 3), ('b-angry m-flat al-type1 ar-type2 bd-fwd', 2), ('b-angry m-flat al-type2 ar-type1 bd-fwd', 2)],
    'wait': [('m-flat hr-sign ar-up al-hip', 3), ('m-flat hr-sign ar-up al-hip f-tapR', 2), ('b-up m-small hr-sign ar-wave1 al-hip bd-leanR', 1),
             ('b-up m-small hr-sign ar-wave2 al-hip bd-leanL', 1), ('b-up m-small hr-sign ar-wave1 al-hip bd-leanR', 1),
             ('b-up m-small hr-sign ar-wave2 al-hip bd-leanL', 1), ('e-half l-right b-one m-pout hr-sign ar-up al-hip f-tapR', 4),
             ('e-shine b-up c-blush m-grin hr-sign ar-cheer al-wave1 bd-hop', 2)],
    'pr': [('e-shine b-up m-grin hr-trophy ar-up al-cheer f-runL x-conf1', 2), ('e-shine b-up m-grin hr-trophy ar-up al-cheer f-runR bd-hop x-conf2', 2),
           ('e-happy m-shout hr-trophy ar-cheer al-cheer bd-hop x-conf3', 2), ('e-star b-up c-blush m-grin hr-trophy ar-up al-hip f-kick x-conf1', 4),
           ('m-smirk al-type1 ar-type2', 2), ('m-smirk al-type2 ar-type1', 2), ('e-happy m-grin al-type1 ar-type2', 2), ('m-smirk al-type2 ar-type1', 2)],
    'crashed': [('e-dead c-pale m-flat al-low ar-low bd-slump', 4), ('e-dead c-pale m-wobble al-low ar-low bd-slump x-sweat1', 3),
                ('e-dead c-pale m-blep al-low ar-low bd-slump', 3)],
    'shred': rep([('e-wide b-worry m-flat hl-paper al-raise ar-carry bd-leanL', 1), ('e-wide b-worry m-open hl-paper al-low ar-carry bd-fwd x-papers1', 1)], 3)
    + [('e-squint m-wobble al-head ar-low x-sweat2', 2)],
    'feetup': [('e-half m-smirk bd-back f-up hl-plane al-wave1 ar-head', 4), ('e-squint m-blep bd-back f-up hl-plane al-ham1 ar-head', 2),
               ('e-happy m-open bd-back f-up al-throw2 ar-head', 2), ('e-wide l-left b-up m-small bd-back f-up al-low ar-head', 4),
               ('e-half m-yawn bd-back f-up al-low ar-head', 3)],
    'spin': [('e-happy m-grin al-cheer ar-cheer f-kick', 3), ('e-shine b-up m-open al-up ar-up f-wide', 3)],
    'nap': [('e-closed m-drool bd-nap al-low ar-low x-z1', 4), ('e-closed m-small bd-nap al-low ar-low x-z2', 4), ('e-closed m-drool bd-nap al-low ar-low x-z3', 4)],
    'phone': [('e-half l-down b-flat m-flat hr-phone ar-phone al-hip', 5), ('e-half l-down b-flat m-smirk hr-phone ar-phone al-hip', 3),
              ('e-wide l-down b-up m-open hr-phone ar-phone al-face', 2), ('e-happy l-right m-grin hr-phone ar-raise al-hip', 3)],
    'chat': [('l-left b-up m-open hl-mug al-raise ar-out', 2), ('l-left m-grin hl-mug al-raise ar-hip', 2), ('l-left e-closed m-small hl-mug al-sip ar-hip', 3),
             ('l-left e-half b-one m-pout hl-mug al-raise ar-shrug', 3), ('l-left e-happy m-shout hl-mug al-raise ar-hip bd-back', 3)],
    'runmug': [('e-wide b-worry m-open hr-mug ar-raise al-out f-runL bd-leanR x-sweat1', 1), ('e-wide b-worry m-flat hr-mug ar-raise al-low f-runR bd-hop', 1)],
    'runbox': [('fr-box al-hold ar-hold b-worry m-flat f-runL', 1), ('fr-box al-hold ar-hold b-worry m-small f-runR bd-hop', 1)],
    'stroll': [('e-half l-right m-smirk hl-paper al-raise ar-low f-swingL', 3), ('e-half l-right m-smirk hl-paper al-raise ar-down f-swingR', 3)],
    'yawn': [('e-half m-flat al-low ar-low', 3), ('e-closed m-yawn al-cheer ar-cheer bd-stretch', 4), ('e-half m-small al-head ar-hip', 3)],
    'ride': [('e-half m-small fr-box al-hold ar-hold', 6), ('e-wide l-up m-small fr-box al-hold ar-hold', 3)],
}

GRUMP = 'al-cross ar-cross2'
LOOPS.update({
    'grump': [('e-half l-left b-flat m-pout %s x-clock1' % GRUMP, 2), ('e-half l-left b-flat m-pout %s x-clock2' % GRUMP, 2),
              ('e-half l-left b-flat m-pout %s x-clock3' % GRUMP, 2), ('e-half l-left b-flat m-pout %s x-clock4' % GRUMP, 2),
              ('e-half l-up b-angry m-flat %s x-clock1' % GRUMP, 3), ('e-closed b-angry m-frown %s bd-puff x-steam1' % GRUMP, 2),
              ('e-closed b-flat m-flat hr-mug ar-sip al-hip', 3), ('e-half l-left b-one m-pout hr-mug ar-raise al-hip', 4)],
    'stall': [('e-wide l-up m-small hl-mag al-raise ar-chin', 9), ('e-closed m-small hl-mag al-raise ar-chin', 1),
              ('e-wide l-upR m-small hl-mag al-raise ar-chin x-think3', 8), ('e-closed m-small hl-mag al-raise ar-chin x-think3', 1)],
    'reject': [('e-half l-right b-one m-flat hl-clip al-low ar-point', 3), ('e-squint b-angry m-small hl-clip al-low ar-ham1', 2),
               ('e-half b-flat m-flat hl-clip al-low ar-ham2 bd-fwd x-pop', 2), ('e-half l-up b-flat m-flat hl-clip al-low ar-hip', 3),
               ('m-smirk hl-clip al-low ar-hip', 3)],
    'queue': [('e-half l-left b-flat m-flat hr-mug ar-carry al-hip f-tapR', 3), ('e-half l-left b-flat m-flat hr-mug ar-carry al-hip', 2),
              ('e-half l-up b-one m-pout hr-mug ar-carry al-hip', 3), ('e-closed m-yawn hr-mug ar-low al-cheer bd-stretch', 3),
              ('e-half l-left b-flat m-flat hr-mug ar-carry al-hip f-tapR', 3)],
    'showlead': [('m-flat hr-sign ar-up al-hip', 3), ('b-up m-small hr-sign ar-wave1 al-hip bd-leanR', 1), ('b-up m-small hr-sign ar-wave2 al-hip bd-leanL', 1),
                 ('b-up m-small hr-sign ar-wave1 al-hip bd-leanR', 1), ('b-up m-small hr-sign ar-wave2 al-hip bd-leanL', 1),
                 ('e-half l-right b-one m-pout hr-sign ar-up al-hip f-tapR', 4), ('e-tear b-worry m-wobble al-palm ar-low bd-low', 3),
                 ('e-star b-up c-blush m-grin al-cheer ar-cheer bd-hop x-conf1', 3), ('e-half b-flat m-pout %s f-tapR' % GRUMP, 3),
                 ('e-shine b-up m-open al-wave1 ar-hip', 2)],
})
POSES = [
    dict(id='p1', name='Waiting on you', role='r-lead t-bre', bg='#a5e6c9',
         trig='A permission prompt or a question is up. Loops until you answer; the paddle is the one thing you can read from across the room.',
         say='"Whenever you are ready." "No rush. Some rush."',
         a=[('m-flat hr-sign ar-up al-hip', 3), ('m-flat hr-sign ar-up al-hip f-tapR', 2), ('m-flat hr-sign ar-up al-hip', 2),
            ('m-flat hr-sign ar-up al-hip f-tapR', 2), ('b-up m-small hr-sign ar-wave1 al-hip bd-leanR', 1), ('b-up m-small hr-sign ar-wave2 al-hip bd-leanL', 1),
            ('b-up m-small hr-sign ar-wave1 al-hip bd-leanR', 1), ('b-up m-small hr-sign ar-wave2 al-hip bd-leanL', 1),
            ('e-half l-right b-one m-pout hr-sign ar-up al-hip f-tapR', 4),
            ('e-shine b-up c-blush m-grin hr-sign ar-cheer al-wave1 bd-hop', 6, 'Whenever you are ready.')]),
    dict(id='p2', name='Failed test', role='r-ve', bg='#ffc47f',
         trig='A test run fails. The third failure in a row plays the flail at double speed.',
         say='"It passed on my machine." "Again."',
         a=[('e-wide b-up m-open hl-mag al-raise bd-stretch', 3)] + rep([FL_A, FL_B], 3)
         + [('e-tear b-worry m-wobble al-palm ar-low bd-low x-sweat1', 5, 'It passed on my machine.'), ('b-angry m-flat al-hip ar-hip bd-puff', 5, 'Again.')]),
    dict(id='p3', name='PR opened', role='r-bu', bg='#a6d0ff',
         trig='A pull request is opened. A trophy lap, then a pose for the camera.',
         say='"PR #219. Frame it." "Ship it before it changes its mind."',
         a=[('e-shine b-up m-grin hr-trophy ar-up al-cheer f-runL x-conf1', 2), ('e-shine b-up m-grin hr-trophy ar-up al-cheer f-runR bd-hop x-conf2', 2),
            ('e-shine b-up m-grin hr-trophy ar-up al-cheer f-runL x-conf3', 2), ('e-happy m-shout hr-trophy ar-cheer al-cheer bd-hop x-conf1', 2),
            ('e-star b-up c-blush m-grin hr-trophy ar-up al-hip f-kick x-conf2', 6, 'PR #219. Frame it.')]),
    dict(id='p4', name='Spawning a subagent', role='r-lead t-lan', role2='r-sc', bg='#ffc47f', dx=11, names=('lead', 'new '),
         trig='A subagent is hired. The lead hands over the job; the new one pops in, takes the parcel and runs for the file cabinets.',
         say='"One job. Find saveDraft." "Bring it back in one piece."',
         a=[('l-right m-small fr-box al-hold ar-hold', 3), ('e-happy l-right m-grin fr-box al-hold ar-hold bd-leanR', 2),
            ('l-right m-open al-low ar-point bd-leanR', 4, 'One job. Find saveDraft.'), ('e-happy m-grin al-hip ar-wave1', 1), ('e-happy m-grin al-hip ar-wave2', 1),
            ('e-happy m-grin al-hip ar-wave1', 1), ('e-happy m-grin al-hip ar-wave2', 1), ('e-half l-right m-smirk al-hip ar-hip', 5, 'Bring it back in one piece.')],
         b=[('at-off', 3), ('at-s1 e-shine b-up m-open al-cheer ar-cheer bd-hop x-pop', 2), ('at-s1 e-shine m-grin fr-box al-hold ar-hold bd-squash', 4),
            ('at-s2 b-angry m-flat fr-box al-hold ar-hold f-runL bd-leanR', 1), ('at-s2 b-angry m-flat fr-box al-hold ar-hold f-runR bd-hop', 1),
            ('at-s3 b-angry m-flat fr-box al-hold ar-hold f-runL bd-leanR', 1), ('at-s3 b-angry m-flat fr-box al-hold ar-hold f-runR bd-hop x-dust', 1),
            ('at-s3 a-binoc m-small al-face ar-face f-wide', 5)]),
    dict(id='p5', name='Asleep at the desk', role='r-lead t-ket fr-desk', bg='#d2c0ff',
         trig='Idle for 10 minutes. It nods off on the keyboard, then pretends it did not.',
         say='"zzz" "I was resting my context."',
         a=[('e-half m-small al-type1 ar-type2', 2), ('e-closed m-yawn al-cheer ar-cheer bd-stretch', 3), ('e-closed m-small al-low ar-low bd-low x-z1', 3),
            ('e-closed m-drool al-low ar-low bd-nap x-z2', 4), ('e-closed m-drool al-low ar-low bd-nap x-z3', 5),
            ('e-wide b-up m-open al-out ar-out bd-stretch x-pop', 2), ('e-half l-right c-blush m-small al-type1 ar-type2', 5, 'I was resting my context.')]),
    dict(id='p6', name='Waiting, rare variant', role='r-lead t-bre', bg='#a5e6c9',
         trig='1 time in 20 this replaces the waiting pose. Same trigger, more dignity lost.',
         say='"I will name a variable after you."',
         a=[('e-tear b-worry m-wobble fr-pls al-hi ar-hi bd-low', 3), ('e-tear b-worry m-small fr-pls al-hi ar-hi bd-leanL', 2),
            ('e-tear b-worry m-wobble fr-pls al-hi ar-hi bd-leanR', 2), ('e-tear b-worry m-small fr-pls al-hi ar-hi bd-leanL', 2),
            ('e-shine b-worry c-blush m-small fr-pls al-hi ar-hi bd-stretch', 6, 'I will name a variable after you.')]),
    dict(id='p7', name='Thinking hard', role='r-rv', bg='#ffbdd6',
         trig='A long stretch of thinking with no tool calls. Ends with an idea, good or otherwise.',
         say='"Hm." "What if we just deleted it."',
         a=[('e-half l-upR b-one m-small hl-clip al-low ar-chin x-think1', 2), ('e-half l-upR b-one m-small hl-clip al-low ar-chin x-think2', 2),
            ('e-half l-upR b-one m-pout hl-clip al-low ar-chin bd-tilt x-think3', 4, 'Hm.'), ('e-squint b-angry m-flat hl-clip al-low ar-head x-think3', 3),
            ('e-wide b-up m-open hl-clip al-out ar-out bd-stretch x-idea', 2), ('e-star b-up m-grin hl-clip al-low ar-point bd-hop x-idea', 6, 'What if we just deleted it.')]),
    dict(id='p8', name='Celebrating with a teammate', role='r-bu', role2='r-ve', bg='#a6d0ff', dx=19, names=('builder ', 'verifier'),
         trig='A subagent reports green to the one that hired it. Paddle up, high five, pom-poms, then straight back to pretending it was easy.',
         say='"Green. Nobody touch anything."',
         a=[('e-wide l-right b-up m-open', 2), ('e-shine m-grin al-cheer ar-cheer bd-hop x-conf1', 2), ('e-happy l-right m-shout al-hip ar-five bd-leanR', 2),
            ('e-happy l-right m-shout al-hip ar-five bd-leanR x-spark', 2), ('e-happy m-grin hl-pom hr-pom al-wave1 ar-wave2 f-runL x-conf2', 1),
            ('e-happy m-grin hl-pom hr-pom al-wave2 ar-wave1 f-runR bd-hop x-conf3', 1), ('e-happy m-grin hl-pom hr-pom al-wave1 ar-wave2 f-runL x-conf1', 1),
            ('e-happy m-grin hl-pom hr-pom al-wave2 ar-wave1 f-runR bd-hop x-conf2', 1), ('e-half m-smirk al-hip ar-hip', 6, 'Green. Nobody touch anything.')],
         b=[('e-wide l-left b-up m-open hr-ok ar-up', 2), ('e-shine m-grin hr-ok ar-cheer al-cheer bd-hop', 2), ('e-happy l-left m-shout hr-ok ar-raise al-five bd-leanL', 2),
            ('e-happy l-left m-shout hr-ok ar-raise al-five bd-leanL', 2), ('e-happy m-grin hl-pom hr-ok al-wave2 ar-wave1 f-runR bd-hop', 1),
            ('e-happy m-grin hl-pom hr-ok al-wave1 ar-wave2 f-runL', 1), ('e-happy m-grin hl-pom hr-ok al-wave2 ar-wave1 f-runR bd-hop', 1),
            ('e-happy m-grin hl-pom hr-ok al-wave1 ar-wave2 f-runL', 1), ('e-closed c-blush m-grin hr-ok ar-raise al-hip', 6)]),
    dict(id='p9', name='Grumpy at a 40-minute build', role='r-bu', bg='#ffc47f',
         trig='A command has been running for 40 minutes. Arms folded, foot going, the clock goes round; it sips at 45.',
         say='"Forty minutes. I have aged." "It is fine. I love waiting."',
         a=[('e-half b-flat m-pout %s f-tapR x-clock1' % GRUMP, 2), ('e-half b-flat m-pout %s x-clock2' % GRUMP, 2), ('e-half b-flat m-pout %s f-tapR x-clock3' % GRUMP, 2),
            ('e-half b-flat m-pout %s x-clock4' % GRUMP, 2), ('e-half l-upR b-angry m-flat %s f-tapR x-clock1' % GRUMP, 3),
            ('e-closed b-angry m-frown %s bd-puff x-steam1' % GRUMP, 2), ('e-squint b-angry m-shout al-low ar-low bd-puff x-steam2', 2),
            ('e-closed b-flat m-flat hr-mug ar-sip al-hip', 4), ('e-half b-one m-pout hr-mug ar-raise al-hip', 6, 'Forty minutes. I have aged.')]),
]

LOOPS['hi5a'] = [f[:2] for f in POSES[7]['a']]
LOOPS['hi5b'] = [f[:2] for f in POSES[7]['b']]

# ---------------------------------------------------------------- document shell and logic
JS_HEAD = '''class Component extends DCLogic {
componentDidMount() {
if (%(tick)s) this.iv = setInterval(() => { const t = (this.state && this.state.t) || 0; this.setState({ t: t + 1 }); }, 130);
}
componentWillUnmount() { clearInterval(this.iv); }
renderVals() {
const s = this.state || {};
const t = (s.t || 0) + %(t0)d;
const L = %(loops)s;
const A = %(actors)s;
const v = {};
const pick = (f, u) => { let n = 0; for (const x of f) n += x[1]; u = u %% n; let i = 0; for (const x of f) { if (u < x[1]) return [x, i, f.length]; u -= x[1]; i++; } return [f[0], 0, f.length]; };
for (const k in A) v[k] = pick(L[A[k][0]], t + A[k][1])[0][0];
'''


def doc(title, w, h, body, js):
    return ('<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<title>%s</title>\n<script src="./support.js"></script>\n'
            '<link rel="stylesheet" href="bb.css">\n</head>\n<body>\n<x-dc>\n<helmet>\n%s\n<style>\nbody{margin:0}\n</style>\n</helmet>\n%s\n</x-dc>\n'
            '<script type="text/x-dc" data-dc-script data-props=\'{"$preview":{"width":%d,"height":%d}}\'>\n%s\n</script>\n</body>\n</html>\n'
            % (title, FONT, body, w, h, js))


def js_head(loops, actors, t0=0, tick=True):
    used = {a[0] for a in actors.values()}
    return JS_HEAD % dict(tick='true' if tick else 'false', t0=t0, loops=json.dumps({k: v for k, v in loops.items() if k in used}),
                          actors=json.dumps(actors))


# ---------------------------------------------------------------- Cast
def cast(t0=0, tick=True):
    actors = {}

    def act(loop, off=0):
        k = 'c%d' % (len(actors) + 1)
        actors[k] = [loop, off]
        return k

    def cell(title, text, inner, bg):
        return ('<div class="cell"><div class="stage %s" style="height:176px">%s</div><h3>%s</h3><div class="meta">%s</div></div>' % (bg, inner, title, text))
    P = dict(x=38, y=36, fs=5)
    work = [
        cell('Session lead', 'Headset, and a tie in its project colour. Owns the desk and does the hiring.',
             pup('r-lead t-lan fr-desk', act('frantic'), **P), 'bg-lan'),
        cell('Builder', 'Hard hat and hi-vis. Hammers until it compiles. Its own bench means its own worktree.',
             pup('r-bu', act('hammer', 2), **P), 'bg-orb'),
        cell('Scout', 'Ranger hat, binoculars. Runs to the file cabinets and comes back with a map.',
             pup('r-sc', act('scout'), **P), 'bg-bre'),
        cell('Explorer', 'Pith helmet and a torch. Smaller the deeper it was hired; trails its scout like a duckling.',
             pup('r-ex', act('kidlook', 3), x=48, y=58, fs=4), 'bg-lan'),
        cell('Reviewer', 'Round glasses, bow tie, clipboard. Lives in the meeting room. Has notes.',
             pup('r-rv', act('review', 1), **P), 'bg-mos'),
        cell('Verifier', 'Visor, badge, magnifier. Raises the green paddle. Or does not.',
             pup('r-ve', act('verify', 4), **P), 'bg-bre'),
        cell('Designer', 'Beret, scarf, one brush. Steps back, squints, moves it two pixels.',
             pup('r-de', act('paint', 2), **P), 'bg-ket'),
    ]
    lazy = [
        cell('Feet up', 'Idle under 10 minutes. Paper planes get involved.', pup('r-lead t-orb fr-desk', act('feetup'), **P), 'bg-kit'),
        cell('Face down on the keys', 'Idle 10 minutes or more. It is resting its context.', pup('r-lead t-ket fr-desk', act('nap', 3), **P), 'bg-kit'),
        cell('Chair spin', 'Paused by you. It has found the swivel.',
             '<span class="spinw" style="left:38px;top:36px;width:100px;height:125px"><span class="it chair" style="left:14px;top:42px;width:72px;height:80px"></span>'
             + pup('r-sc', act('spin'), x=0, y=-8, fs=5) + '</span>', 'bg-kit'),
        cell('Scrolling', 'Finished. Nobody has closed it yet.', pup('r-lead t-mos', act('phone', 2), **P), 'bg-kit'),
        cell('Water cooler', 'Idle and stopped ones drift to the kitchen and talk about you.',
             '<span class="it cooler" style="left:72px;top:94px"></span>' + pup('r-lead t-mos', act('phone', 6), x=4, y=62, fs=3.6)
             + pup('r-bu', act('chat'), x=96, y=62, fs=3.6), 'bg-kit'),
        cell('The stretch', 'Waiting on a slow build. See also: grumpy.', pup('r-ve', act('yawn', 1), **P), 'bg-kit'),
        cell('The slow walk', 'Carries one sheet of paper past your desk to look busy.', pup('r-de', act('stroll'), **P), 'bg-kit'),
    ]
    faces = [('sparkle (rest)', ''), ('wide', 'e-wide b-up m-open'), ('shine', 'e-shine b-up c-blush m-grin'), ('teary', 'e-tear b-worry m-wobble'),
             ('squint', 'e-squint b-angry m-blep'), ('happy', 'e-happy c-blush m-shout'), ('half-lid', 'e-half b-flat m-pout'), ('stars', 'e-star b-up m-grin'),
             ('side-eye', 'e-half l-right b-one m-smirk'), ('asleep', 'e-closed m-drool'), ('crashed', 'e-dead c-pale m-wobble'), ('yawn', 'e-closed b-up m-yawn')]
    roles = ['r-lead t-lan', 'r-bu', 'r-sc', 'r-rv', 'r-ve', 'r-de', 'r-ex', 'r-lead t-bre', 'r-bu', 'r-sc', 'r-lead t-orb', 'r-ve']
    fc = ''.join('<div class="cell"><div class="stage bg-face" style="height:92px">%s</div><div class="meta" style="text-align:center">%s</div></div>'
                 % (pup(roles[i] + ' ' + c, None, x=18, y=6, fs=3.3), n) for i, (n, c) in enumerate(faces))
    body = ('<div class="bb sheet" style="width:1440px;height:900px">'
            '<h1>Busybodies · the cast</h1>'
            '<p class="lede">Paper puppets, one per agent. Every part is its own cut-out (body, two-joint arms, legs, eyes, brows, cheeks, mouth, costume, whatever is in each hand), '
            'and every part springs to its next value, so nothing steps. A role is a costume and a habit; busy is frantic, idle is shameless.</p>'
            '<h2>Hard at it</h2><div class="grid" style="grid-template-columns:repeat(7,minmax(0,1fr))">%s</div>'
            '<h2>Slacking, obviously</h2><div class="grid" style="grid-template-columns:repeat(7,minmax(0,1fr))">%s</div>'
            '<h2>Faces</h2><div class="grid" style="grid-template-columns:repeat(12,minmax(0,1fr))">%s</div>'
            '</div>') % (''.join(work), ''.join(lazy), fc)
    js = js_head(LOOPS, actors, t0, tick) + 'return v;\n}\n}'
    return doc('Busybodies, the cast', 1440, 900, body, js)


# ---------------------------------------------------------------- Acting
def acting(t0=0, tick=True):
    loops, actors, cells = {}, {}, []
    for p in POSES:
        i = p['id']
        loops[i] = [list(f) for f in p['a']]
        actors[i] = [i, 0]
        fs = 7.4
        two = 'b' in p
        x0 = 30 if two else 70
        inner = pup(p['role'], i, x=x0, y=54, fs=fs)
        if two:
            assert [f[1] for f in p['a']] == [f[1] for f in p['b']], i
            loops[i + 'b'] = [list(f) for f in p['b']]
            actors[i + 'b'] = [i + 'b', 0]
            inner += pup(p['role2'], i + 'b', x=x0 + p['dx'] * fs, y=54 + (0 if p['dx'] > 15 else 30), fs=fs if p['dx'] > 15 else 6.2)
        inner += '<div class="bub %s{{%sbub}}">{{%ssay}}</div>' % ('l ' if i == 'p8' else '', i, i)
        cells.append('<div class="cell"><div class="stage" style="height:250px;background-color:%s">%s</div>'
                     '<h3>%s<span>{{%sn}}</span></h3><div class="meta">%s</div><div class="meta">May say: %s</div><div class="code">{{%scode}}</div></div>'
                     % (p['bg'], inner, p['name'], i, p['trig'], p['say'], i))
    body = ('<div class="bb sheet" style="width:1440px;height:1440px">'
            '<h1>Busybodies · acted poses</h1>'
            '<p class="lede">Can paper cut-outs act? Nine poses, each played from frame objects like the one printed under it. A frame names a value per part; the engine springs every part there '
            '(shoulder, elbow, brow, cheek, the thing in its hand), so the motion stays smooth and bouncy however few frames a pose has. In PixiJS v8 one puppet is a Container of about 18 sprites '
            'from one shared atlas; faces swap textures, limbs rotate, costumes are just more sprites. A theme reskins the atlas and keeps every frame.</p>'
            '<div class="grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:14px 18px">%s</div></div>') % ''.join(cells)
    names = {p['id']: p.get('names') for p in POSES}
    js = js_head(loops, actors, t0, tick) + '''const KEY = { e: 'eyes', l: 'look', b: 'brows', c: 'cheeks', m: 'mouth', al: 'armL', ar: 'armR', hl: 'holdL', hr: 'holdR', fr: 'front', f: 'feet', bd: 'body', x: 'fx', a: 'wear', at: 'spot' };
const fmt = (c) => '{ ' + c.split(' ').filter(Boolean).map((k) => { const i = k.indexOf('-'); return KEY[k.slice(0, i)] + ": '" + k.slice(i + 1) + "'"; }).join(', ') + ' }';
const N = %s;
for (const id in N) {
const r = pick(L[id], t);
v[id + 'n'] = 'frame ' + (r[1] + 1) + ' of ' + r[2];
v[id + 'say'] = r[0][2] || '';
v[id + 'bub'] = r[0][2] ? '' : 'hide';
v[id + 'code'] = N[id] ? N[id][0] + ' ' + fmt(v[id]) + '\\n' + N[id][1] + ' ' + fmt(v[id + 'b']) : fmt(v[id]);
}
return v;
}
}''' % json.dumps(names)
    return doc('Busybodies, acted poses', 1440, 1440, body, js)


# ---------------------------------------------------------------- build
def write(name, text, also_preview=True):
    for d in ([PROJ, PREV] if also_preview else [PROJ]):
        with open(os.path.join(d, name), 'w') as f:
            f.write(text)


def build():
    os.makedirs(PREV, exist_ok=True)
    import office
    office.build(sys.modules[__name__])
    import r3
    r3.build(sys.modules[__name__])
    css = (open(os.path.join(HERE, 'bb.src.css')).read() + gen_css() + open(os.path.join(HERE, 'bb.office.css')).read()
           + open(os.path.join(HERE, 'bb.r3.css')).read() + office.cam_css())
    write('bb.css', css)
    write('Cast.dc.html', cast())
    write('Acting.dc.html', acting())
    for t in (0, 9, 14, 19, 24):
        with open(os.path.join(PREV, 'Acting@%d.dc.html' % t), 'w') as f:
            f.write(acting(t0=t, tick=False))
    for t in (0, 5, 9):
        with open(os.path.join(PREV, 'Cast@%d.dc.html' % t), 'w') as f:
            f.write(cast(t0=t, tick=False))
    if '--arms' in sys.argv:
        for n, v in ARMS.items():
            print(n, hand(v[0], v[1]))


if __name__ == '__main__':
    build()
