"""The explorable office, drawn twice from one cast: a side-on cutaway and a 3/4 open floor."""
import json, os

VIEWS = {
    'side': dict(cls='v-side', W=2240, H=1000, RH=400, FD=96, TOP=8, name='Layout 1 · Cutaway'),
    'floor': dict(cls='v-34', W=1960, H=990, RH=400, FD=290, TOP=24, name='Layout 2 · Open floor'),
}
ROOMS = {  # key: (x, y, w)
    'side': dict(lan=(40, 100, 1100), mtg=(1140, 100, 320), orb=(1460, 100, 740),
                 lan2=(40, 510, 620), bre=(660, 510, 420), kit=(1080, 510, 420), mos=(1500, 510, 380), ket=(1880, 510, 320)),
    'floor': dict(lan=(30, 30, 900), mtg=(930, 30, 330), orb=(1260, 30, 670),
                  lob=(30, 560, 250), bre=(280, 560, 440), kit=(720, 560, 440), mos=(1160, 560, 400), ket=(1560, 560, 370)),
}
REL = {'side': (40, 100, 590, 400), 'floor': (30, 30, 640, 400)}
KF = {}


def cam_css():
    o = ['', '/* ---------- generated: cameras and walkers ---------- */']
    for vk, V in VIEWS.items():
        def rule(key, x, y, w, h, x1=1420, smax=1.7):
            s = min((x1 - 20 - 40) / w, 690 / h, smax)
            tx = (20 + x1) / 2 - s * (x + w / 2)
            ty = 440 - s * (y + h / 2)
            o.append('.%s .world.%s{transform:translate(%.1fpx,%.1fpx) scale(%.4f)}' % (key, V['cls'], tx, ty, s))
        s = min(1400 / V['W'], 700 / V['H'])
        o.append('.c-all .world.%s{transform:translate(%.1fpx,%.1fpx) scale(%.4f)}' % (V['cls'], 720 - s * V['W'] / 2, 440 - s * V['H'] / 2, s))
        for k, (x, y, w) in ROOMS[vk].items():
            rule('c-' + k, x, y, w, V['RH'])
        rule('c-rel', *REL[vk], x1=1030, smax=2)
    return '\n'.join(o) + '\n' + '\n'.join(KF.values()) + '\n'


class Room:
    def __init__(s, sc, key, name, sub, cls, need=False):
        s.sc, s.key, s.name, s.sub, s.cls, s.need, s.items = sc, key, name, sub, cls, need, []
        s.x, s.y, s.w = ROOMS[sc.vk][key]
        s.V = sc.V

    def base(s, z):
        return s.V['RH'] - 16 - z * (s.V['FD'] - 40)

    def zi(s, z):
        return int(10 + (1 - z) * 50)

    def raw(s, h):
        s.items.append(h)

    def put(s, cls, x, z, w, h, inner='', extra='', dz=0):
        s.raw('<div class="it %s" style="left:%dpx;top:%dpx;width:%dpx;height:%dpx;z-index:%d"%s>%s</div>'
              % (cls, x, s.base(z) - h, w, h, s.zi(z) + dz, extra, inner))

    def wall(s, cls, x, y, w, h, inner=''):
        s.raw('<div class="it %s" style="left:%dpx;top:%dpx;width:%dpx;height:%dpx;z-index:2">%s</div>' % (cls, x, y, w, h, inner))

    def pup(s, role, x, z, fs=4.0, loop=None, off=0, cls='', lift=0, dz=0, tag=''):
        hole = s.sc.act(loop, off) if loop else None
        y = s.base(z) - 25 * fs - lift
        s.raw(s.sc.g.pup(role, hole, x=x, y=y, fs=fs, cls=cls, z=s.zi(z) + dz))
        if tag:
            s.tag(x - 4, s.base(z) + 3, tag)
        return y

    def edge(s, z):
        return s.base(z) - 48 - s.V['TOP']

    def seated(s, role, x, z, fs, loop, off=0, cls=''):
        hole = s.sc.act(loop, off) if loop else None
        y = s.edge(z) - (16.5 + s.sc.g.SEAT_UP.get(s.sc.g.SHAPE, 0)) * fs
        s.raw(s.sc.g.pup(role, hole, x=x, y=y, fs=fs, cls=cls, z=s.zi(z) - 1))
        return y

    def desk(s, x, z, w, kind='', kids='', click=None):
        s.put('desk ' + kind, x, z, w, 44, kids, ' onClick="{{%s}}"' % click if click else '')

    def lab(s, x, top, title, detail='', cls='', click=None, below=None):
        pos = 'top:%dpx' % below if below is not None else 'bottom:%dpx' % (s.V['RH'] - 10 - top + 5)
        cls += ' lb' if below is not None else ''
        s.raw('<div class="lab %s" style="left:%dpx;%s"%s><strong>%s</strong><span class="d">%s</span></div>'
              % (cls, x, pos, ' onClick="{{%s}}"' % click if click else '', title, detail))

    def tag(s, x, y, text):
        s.raw('<div class="tag" style="left:%dpx;top:%dpx">%s</div>' % (x, y, text))

    def say(s, x, y, text, grp=1, cls='', think=False, right=False):
        """x, y: the bubble's tail corner, in room coordinates."""
        pos = 'right:%dpx' % (s.w - 10 - x) if right else 'left:%dpx' % x
        s.raw('<div class="%s g%d %s" style="%s;bottom:%dpx">%s</div>' % ('thk' if think else 'say', grp, cls, pos, s.V['RH'] - 10 - y, text))

    def sign(s, x, y, w, text, cls=''):
        s.raw('<div class="sgn %s" style="left:%dpx;top:%dpx;width:%dpx">%s</div>' % (cls, x, y, w, text))

    def stk(s, x, y, text, cls='', delay=0.0):
        s.raw('<div class="stk %s" style="left:%dpx;top:%dpx;animation-delay:%gs">%s</div>' % (cls, x, y, delay, text))

    def walker(s, x0, x1, z, dur, pups, tag='', delay=0.0, say=None):
        s.raw(s.sc.walk_html(x0, x1, s.base(z), s.zi(z), dur, pups, tag, delay, say))

    def html(s):
        go = 'go' + s.key.capitalize()
        return ('<div class="room %s%s" style="left:%dpx;top:%dpx;width:%dpx;height:%dpx;z-index:%d" onClick="{{%s}}"><div class="flr"></div>'
                '<div class="rhead"><div class="name">%s</div><div class="sub">%s</div></div>%s</div>'
                % (s.cls, ' need' if s.need else '', s.x, s.y, s.w, s.V['RH'], 10 + s.y // 10, go, s.name, s.sub, ''.join(s.items)))


class Scene:
    def __init__(s, g, vk):
        s.g, s.vk, s.V, s.actors, s.rooms, s.world, s.nw = g, vk, VIEWS[vk], {}, [], [], 0

    def act(s, loop, off=0):
        k = 'a%d' % (len(s.actors) + 1)
        s.actors[k] = [loop, off]
        return k

    def room(s, key, name, sub, cls, need=False):
        r = Room(s, key, name, sub, cls, need)
        s.rooms.append(r)
        return r

    def walk_html(s, x0, x1, base, zi, dur, pups, tag='', delay=0.0, say=None):
        """pups: (role, loop, off, fs, dx). The wrapper eases there and back; the inner sheet flips like paper at each end."""
        s.nw += 1
        name = 'wk%s%d' % (s.vk, s.nw)
        KF[name] = ('@keyframes %s{0%%,3%%{transform:translateX(0)}45%%,53%%{transform:translateX(%dpx)}95%%,100%%{transform:translateX(0)}}' % (name, x1 - x0))
        h = max(25 * p[3] for p in pups)
        w = max(p[4] + 20 * p[3] for p in pups)
        inner = ''.join(s.g.pup(p[0], s.act(p[1], p[2]), x=p[4], y=h - 25 * p[3], fs=p[3]) for p in pups)
        t = '<div class="tag" style="left:0;top:%dpx">%s</div>' % (-30, tag) if tag else ''
        if say:
            t += '<div class="say g%d" style="left:%dpx">%s</div>' % (say[1], say[2], say[0])
        return ('<div class="walk" style="left:%dpx;top:%dpx;width:%dpx;height:%dpx;z-index:%d;animation:%s %gs ease-in-out %gs infinite">'
                '<div class="flip %s" style="animation-duration:%gs;animation-delay:%gs">%s</div>%s</div>'
                % (x0, base - h, w, h, zi, name, dur, delay, 'rv' if x1 < x0 else '', dur, delay, inner, t))


def kid(cls, left, extra=''):
    return '<span class="%s" style="left:%dpx%s"></span>' % (cls, left, extra)


def session(R, x, z, tie, loop, title, detail, lab='', mon='tty', cups=0, w=160, fs=4.4, off=0, kids='', click=None, seated=True, cls='', labx=None, below=False):
    k = kid('mon ' + mon, w - 68) + ''.join(kid('cup', w - 22 - 15 * i) for i in range(cups)) + kids
    top = R.edge(z) - 16.5 * fs
    if seated:
        R.seated('r-lead ' + tie, x + 2, z, fs, loop, off, cls)
    R.desk(x, z, w, '', k, click)
    R.lab(x - 8 if labx is None else labx, top, title, detail, lab, click, R.base(z) + 5 if below else None)
    return top


def bench(R, x, z, loop, off, tag, w=130, bonsai=True, plate=False):
    R.seated('r-bu', x + 40, z, 4, loop, off)
    R.desk(x, z, w, 'gy', kid('bonsai', 10) if bonsai else '')
    if plate:
        R.raw('<div class="tag" style="left:%dpx;top:%dpx;z-index:%d">%s</div>' % (x + 5, R.base(z) - 36, R.zi(z) + 1, tag))
    else:
        R.tag(x + 8, R.edge(z) - 66 - 30, tag)


def lamp(R, x, z, fail=False):
    R.put('tl' + (' fail' if fail else ''), x, z, 8, 60)


WB212 = 'PR #212<i></i><i class="r"></i><i class="s"></i><i class="n"></i>'
TALLY = '<b>Hired today</b>163 in · 134 done<br>12 out · 1 sent home'
FLY = '<div class="fly" style="left:%dpx;top:%dpx;animation-delay:%gs"></div>'


def build_side(g):
    sc = Scene(g, 'side')
    V = sc.V
    # --- lanternfish, upstairs: the release and its crew
    R = sc.room('lan', 'lanternfish', '3 sessions · 9 agents out · $45.60', 'rm-lan')
    R.wall('win', 250, 70, 150, 110)
    R.wall('wb', 470, 60, 190, 120, 'release 2.4<i></i><i class="s"></i><i class="r"></i><i class="n"></i>')
    R.wall('win', 820, 70, 150, 110)
    top = session(R, 30, .9, 't-lan', 'frantic', 'Ship release 2.4', 'busy since 09:12 · Opus · $41.20 · 8 out', '', 'flash', 5, click='goRel')
    for i, (dx, dl, c) in enumerate([(60, 0, ''), (100, .5, 'l'), (130, 1.0, 'm')]):
        R.raw(FLY.replace('class="fly"', 'class="fly %s"' % c) % (30 + dx, top + 20, dl))
    R.stk(250, top - 60, 'PR #214 opened', 'good', 1.5)
    bench(R, 225, .9, 'hammer', 0, '<b>builder</b> · own worktree<br>migrate settings screen')
    bench(R, 400, .9, 'hammer', 5, '<b>builder</b> · own worktree<br>new export endpoint')
    R.pup('r-ve', 536, .55, 3.4, 'verify', 2)
    lamp(R, 612, .7)
    R.put('cab', 650, 1, 66, 104)
    R.put('cab', 722, 1, 66, 104)
    R.walker(370, 590, .08, 7, [('r-ex', 'kid', 1, 2.8, 0), ('r-sc', 'scoutrun', 0, 3.4, 50)], '<b>scout + explorer</b><br>find callers of saveDraft')
    R.put('easel', 815, .9, 58, 70, dz=-1)
    R.pup('r-de', 855, .75, 4, 'paint', 1, tag='<b>designer</b><br>empty state for exports')
    R.pup('r-ve', 960, .6, 4, 'verify', 6, tag='<b>verifier</b><br>walkthrough on staging')
    lamp(R, 1050, .75)
    R.put('plant', 1050, .2, 34, 30)
    # --- meeting room: where reviews happen
    R = sc.room('mtg', 'meeting room', 'reviews happen here', 'rm-mtg')
    R.wall('wb', 30, 86, 170, 120, WB212)
    R.put('desk wh', 24, .85, 120, 44)
    R.put('chair', 40, .3, 50, 62)
    R.pup('r-rv', 196, .6, 4, 'review', 0, tag='<b>reviewer</b><br>read diff for PR #212')
    # --- orbit-kit: a PR party and a crash
    R = sc.room('orb', 'orbit-kit', '2 sessions · 3 agents out · $9.15', 'rm-orb')
    R.wall('win', 210, 70, 150, 110)
    R.wall('win', 430, 70, 150, 110)
    top = session(R, 30, .9, 't-orb', 'pr', 'Pagination for /orbits', 'busy · Sonnet · $6.75 · PR #219 opened 14:24', '', '', 2, kids=kid('troph', 6))
    R.stk(270, top - 60, 'PR #219 opened', 'good', .4)
    bench(R, 225, .9, 'hammer', 3, '<b>builder</b><br>next-page cursor', bonsai=False)
    R.pup('r-ve', 368, .55, 4, 'verify', 9, tag='<b>verifier</b><br>does page 2 load')
    lamp(R, 452, .7)
    top = session(R, 550, .9, 't-orb', 'crashed', 'Rename everything', 'errored · Sonnet · $2.40 · it renamed too much', 'bad', 'tty err flash', 1, labx=490)
    R.raw('<div class="oops" style="left:640px;top:%dpx">oops</div>' % (top - 36))
    for i in range(3):
        R.raw('<div class="smoke" style="left:%dpx;top:%dpx;animation-delay:%gs"></div>' % (660 + 12 * i, top + 14, i * .6))
    # --- lanternfish, downstairs
    R = sc.room('lan2', 'lanternfish', 'downstairs: a busy project takes another floor', 'rm-lan')
    R.wall('win', 380, 70, 150, 110)
    top = session(R, 40, .9, 't-lan', 'panic', 'Flaky login test', 'busy · Sonnet · $3.10 · tests failed ×3', '', 'tty flash', 1)
    R.stk(240, top - 60, 'FAILED ×3', 'bad', 0)
    R.pup('r-ve', 215, .5, 4, 'verifybad', 0, tag='<b>verifier</b><br>login.spec, again')
    lamp(R, 300, .7, True)
    top = session(R, 390, .9, 't-lan', 'feetup', 'Fork: slow CI?', 'idle · Sonnet · $1.30 · feet up', 'zzz', '', 0)
    R.raw('<div class="ppw" style="left:400px;top:%dpx"><div class="pplane"></div></div>' % (top + 6))
    R.raw('<div class="ppw" style="left:420px;top:%dpx"><div class="pplane" style="animation-delay:1.8s"></div></div>' % (top - 30))
    R.put('plant', 566, .9, 34, 30)
    # --- breadbox: needs you
    R = sc.room('bre', 'breadbox', '1 session · waiting on you', 'rm-bre', need=True)
    R.wall('win', 250, 70, 130, 110)
    R.raw('<span class="spinw" style="left:14px;top:%dpx;width:80px;height:100px;z-index:30"><span class="it chair" style="left:13px;top:36px;width:54px;height:62px"></span>%s</span>'
          % (R.base(.7) - 100, g.pup('r-sc', sc.act('spin'), x=0, y=-8, fs=4)))
    R.tag(8, R.base(.7) + 3, '<b>scout</b> · paused<br>wheee')
    session(R, 235, .9, 't-bre', None, 'Crumb cache rewrite', 'waiting 10 min · “May I run rm -rf dist?”', 'hot', 'tty', 2, seated=False, labx=110)
    y = R.pup('r-lead t-bre', 122, .1, 4.6, 'wait', 0, dz=5)
    for d in (0, 1.2):
        R.raw('<div class="ring" style="left:%dpx;top:%dpx;width:150px;height:150px;z-index:9;animation-delay:%gs"></div>' % (93, y - 20, d))
    # --- kitchen: the slackers
    R = sc.room('kit', 'kitchen', 'idle, finished and sent home', 'rm-kit')
    R.wall('board', 130, 60, 190, 84, TALLY)
    R.put('fridge', 18, 1, 84, 150)
    R.put('desk wh', 122, .9, 120, 44, kid('cofm', 12) + kid('cup', 70) + kid('cup', 90))
    R.pup('r-lead t-mos', 232, .4, 4.2, 'phone', 0, tag='<b>Changelog draft</b><br>finished · PR #218')
    R.put('cooler', 316, .8, 42, 66)
    R.pup('r-bu', 338, .35, 4, 'chat', 0, tag='<b>builder</b><br>sent home by you, 14:02')
    # --- mossy-docs: compacting, and a tidy finished desk
    R = sc.room('mos', 'mossy-docs', '2 sessions · $1.50', 'rm-mos')
    R.wall('win', 215, 70, 130, 110)
    R.put('shred', 26, .8, 54, 58)
    y = R.pup('r-lead t-mos', 70, .5, 4.4, 'shred', 0)
    for i, (dx, c) in enumerate([(-30, 'l'), (10, 'm'), (30, '')]):
        R.raw(FLY.replace('class="fly"', 'class="fly %s"' % c) % (70 + 30 + dx, y + 10, i * .5))
    R.lab(40, y - 2, 'Docs sweep', 'compacting · Haiku · cloud · $0.85', '')
    top = session(R, 200, .9, 't-mos', None, 'Changelog draft', 'finished · PR #218 · $0.65 · gone to the kitchen', 'off', 'cld', 0, kids=kid('flagp', 20), seated=False, labx=170)
    # --- kettle-api: asleep
    R = sc.room('ket', 'kettle-api', '1 session · $1.05', 'rm-ket')
    R.wall('win', 150, 70, 130, 110)
    session(R, 70, .9, 't-ket', 'nap', 'Webhook spike', 'idle 31 min · Fable · cloud · resting its context', 'zzz', 'cld', 1)
    R.put('plant', 262, .9, 34, 30)
    # --- world
    W, H = V['W'], V['H']
    w = ['<div class="sky" style="left:-2400px;top:-1600px;width:%dpx;height:2520px"></div>' % (W + 4800),
         '<div class="gnd" style="left:-2400px;top:920px;width:%dpx;height:1600px"></div>' % (W + 4800),
         '<div class="roofb" style="left:30px;top:22px;width:%dpx;height:90px"><div class="disp">BUSYBODIES</div></div>' % (W - 60),
         '<div class="slab" style="left:30px;top:96px;width:%dpx;height:826px"></div>' % (W - 60)]
    w += [r.html() for r in sc.rooms]
    for a, b in zip(sc.rooms, sc.rooms[1:]):
        if a.y == b.y:
            w.append('<div class="dway" style="left:%dpx;top:%dpx"></div>' % (a.x + a.w - 8, a.y + 214))
    # people between rooms
    w.append(sc.walk_html(1220, 1560, 100 + 384, 120, 9, [('r-sc', 'scoutrun', 0, 3.6, 0)], '<b>scout</b><br>find usages of paginate'))
    w.append(sc.walk_html(560, 1010, 510 + 386, 120, 16, [('r-ex', 'stroll', 0, 3.6, 0)], '<b>explorer</b> · finished<br>off to the kitchen', -3))
    w.append(sc.walk_html(1420, 1130, 510 + 388, 121, 8, [('r-sc', 'runmug', 0, 3.4, 0)], '<b>scout</b> · finished<br>one for the road', -1))
    return sc, ''.join(w)


def build_floor(g):
    sc = Scene(g, 'floor')
    V = sc.V
    # --- lanternfish: the frenzy
    R = sc.room('lan', 'lanternfish', '3 sessions · 9 agents out · $45.60', 'rm-lan')
    R.wall('win', 250, 16, 120, 76)
    R.wall('wb tally', 420, 12, 150, 84, 'Days since<br>a test broke<em>0</em><s>3 1 2</s>')
    R.sign(598, 3, 156, 'Caution: scouts running', 'y')
    R.wall('win', 770, 16, 110, 76)
    top = session(R, 30, .62, 't-lan', 'frantic', 'Ship release 2.4', 'busy since 09:12 · Opus · $41.20 · 8 out', '', 'flash', 5, click='goRel',
                  kids='<span class="dnd" style="left:9px">DO NOT DISTURB</span>')
    for i, (dx, dl, c) in enumerate([(60, 0, ''), (100, .5, 'l'), (130, 1.0, 'm')]):
        R.raw(FLY.replace('class="fly"', 'class="fly %s"' % c) % (30 + dx, top + 20, dl))
    R.stk(124, top - 4, 'PR #214 opened', 'good', 1.5)
    bench(R, 250, .62, 'grump', 0, '<b>builder</b> · own worktree<br>export build · minute 40', plate=True)
    R.say(298, 86, 'Minute 40.<br>I have aged.', 1, '', think=True)
    bench(R, 430, .62, 'hammer', 0, '<b>builder</b> · own worktree<br>settings · rejected twice', plate=True)
    R.say(556, 100, 'Rejected twice. It was a good comma.', 3, 'z', think=True)
    R.put('cab', 606, 1, 66, 104)
    R.put('cab', 678, 1, 66, 104)
    R.walker(350, 430, .24, 7, [('r-sc', 'scoutrun', 1, 2.3, 0), ('r-sc', 'scoutrun', 0, 2.8, 50), ('r-sc', 'scoutrun', 1, 3.4, 110)],
             '', say=('A scout for my scout’s scout.', 2, 14))
    R.put('easel', 772, .85, 58, 70, dz=-1)
    R.pup('r-de', 806, .68, 4, 'paint', 1)
    R.tag(742, R.base(.68) + 3, '<b>designer</b><br>empty state for exports')
    R.say(808, 124, 'Two pixels left. No. Back.', 3, 'z r', right=True)
    y = R.pup('r-ve', 40, .1, 4, 'stall', 0, tag='<b>verifier</b> · no output for 9 min<br>it says it is thinking')
    R.raw('<div class="web" style="left:30px;top:%dpx"></div>' % (y + 6))
    lamp(R, 136, .16)
    top = session(R, 190, .2, 't-lan', 'feetup', 'Fork: slow CI?', 'idle · Sonnet · $1.30 · calls this a planning phase', 'zzz', '', 0, below=True)
    R.raw('<div class="ppw" style="left:200px;top:%dpx;z-index:70"><div class="pplane"></div></div>' % (top - 4))
    R.raw('<div class="ppw" style="left:230px;top:%dpx;z-index:70"><div class="pplane" style="animation-delay:1.8s"></div></div>' % (top - 44))
    top = session(R, 590, .2, 't-lan', 'panic', 'Flaky login test', 'busy · Sonnet · $3.10 · retry 5 of 5', '', 'tty flash', 1, below=True)
    R.stk(598, top + 116, 'RETRY 5 OF 5', 'bad', 0)
    R.say(612, top - 6, 'Fifth time is the charm. It was not the charm.', 2, '')
    y = R.pup('r-ve', 796, .1, 4, 'verifybad', 0)
    R.tag(772, y - 30, '<b>verifier</b><br>same red. Hello again.')
    R.put('plant', 846, .95, 34, 30)
    # --- meeting room: same diff, same no
    R = sc.room('mtg', 'meeting room', 'reviews', 'rm-mtg')
    R.sign(14, 12, 122, '<b>This meeting</b>could have been a diff.', '')
    R.wall('wb', 150, 12, 150, 86, 'PR #212 · round 2<i class="r"></i><i class="r"></i><i class="n"></i>')
    R.pup('r-rv', 50, .78, 4, 'reject', 0, tag='<b>reviewer</b> · PR #212, round 2<br>it has notes. So many notes.')
    R.say(138, 148, 'Same diff. Same no.', 2, '')
    R.put('desk wh', 70, .3, 180, 44, kid('nope', 30) + kid('cup', 120))
    R.put('chair', 96, .52, 50, 62)
    R.put('chair', 176, .52, 50, 62)
    R.put('plant', 276, .7, 34, 30)
    # --- orbit-kit: a PR party and a crash
    R = sc.room('orb', 'orbit-kit', '2 sessions · 3 agents out · $9.15', 'rm-orb')
    R.wall('win', 250, 16, 120, 76)
    R.sign(392, 8, 118, '<b>PRs today: 4</b>Humility: 0', 'y t')
    top = session(R, 30, .62, 't-orb', 'pr', 'Pagination for /orbits', 'busy · Sonnet · $6.75 · PR #219 opened 14:24', '', '', 2, kids=kid('troph', 6))
    R.stk(44, top + 110, 'PR #219 opened', 'good', .4)
    R.desk(240, .62, 130, 'gy', '<span class="dnote" style="left:10px">at the high five</span>')
    y = R.pup('r-bu', 110, .14, 4, 'hi5a', 0, tag='<b>builder + verifier</b><br>page 2 loads. Nobody touch anything.')
    R.pup('r-ve', 110 + 76, .14, 4, 'hi5b', 0)
    R.say(150, y - 4, 'Up top.', 1, '')
    lamp(R, 300, .18)
    top = session(R, 470, .55, 't-orb', 'crashed', 'Rename everything', 'errored · Sonnet · $2.40 · it renamed too much', 'bad', 'tty err flash', 1, labx=420)
    R.raw('<div class="oops" style="left:566px;top:%dpx">oops</div>' % (top - 6))
    for i in range(3):
        R.raw('<div class="smoke" style="left:%dpx;top:%dpx;animation-delay:%gs"></div>' % (584 + 12 * i, top + 40, i * .6))
    R.say(474, top + 50, 'I renamed the rename. Then it renamed me.', 3, 'z r', right=True)
    R.put('plant', 620, .95, 34, 30)
    # --- lobby
    R = sc.room('lob', 'lobby', 'in and out', 'rm-lob')
    R.raw('<div class="door" style="left:150px"></div>')
    R.raw('<div class="frm" style="left:14px;top:12px;width:126px"><b>Employee of the month</b>Nobody. Again.</div>')
    R.put('board', 12, .8, 150, 84, TALLY)
    R.put('pod', 84, .5, 150, 66, '<div class="pw">%s</div><b>NAP POD</b>' % g.pup('r-ex e-closed m-small'))
    R.raw('<div class="zz" style="left:196px;top:%dpx">z</div><div class="zz" style="left:208px;top:%dpx;animation-delay:1.5s">Z</div>' % (R.base(.5) - 86, R.base(.5) - 86))
    R.tag(88, R.base(.5) + 3, '<b>explorer</b> · finished 13:50<br>in the nap pod. Earned? Debatable.')
    R.put('sofa', 40, .1, 150, 46)
    R.put('plant', 200, .14, 34, 30)
    # --- breadbox: needs you
    R = sc.room('bre', 'breadbox', '1 session · waiting on you', 'rm-bre', need=True)
    R.raw('<div class="door" style="left:330px"></div>')
    R.wall('win', 190, 16, 110, 76)
    R.sign(14, 10, 124, '<b>Now serving: nobody</b>Your number: 1', 'y')
    R.raw('<span class="spinw" style="left:30px;top:%dpx;width:80px;height:100px;z-index:30"><span class="it chair" style="left:13px;top:36px;width:54px;height:62px"></span>%s</span>'
          % (R.base(.5) - 100, g.pup('r-sc', sc.act('spin'), x=0, y=-8, fs=4)))
    R.tag(24, R.base(.5) + 3, '<b>scout</b> · paused by you<br>it prefers “on sabbatical”')
    R.say(100, R.base(.5) - 84, 'Wheee.', 1, '')
    session(R, 240, .62, 't-bre', None, 'Crumb cache rewrite', 'waiting 10 min · “May I run rm -rf dist?”', 'hot', 'tty', 2, seated=False, labx=150)
    y = R.pup('r-lead t-bre', 170, .1, 4.6, 'wait', 0, dz=5)
    for d in (0, 1.2):
        R.raw('<div class="ring" style="left:%dpx;top:%dpx;width:150px;height:150px;z-index:9;animation-delay:%gs"></div>' % (141, y - 14, d))
    R.say(266, y + 18, 'No rush. Some rush.', 2, '')
    # --- kitchen: the slackers and the queue
    R = sc.room('kit', 'kitchen', 'idle, finished and sent home', 'rm-kit')
    R.raw('<div class="door" style="left:350px"></div>')
    R.sign(196, 8, 146, '<b>1 cup per green build</b>Finished? Close your own session.', 'p t')
    R.put('fridge', 24, .92, 84, 150)
    R.put('desk wh', 130, .85, 130, 44, kid('cofm', 12) + kid('cup', 70) + kid('cup', 92))
    R.put('cooler', 286, .85, 42, 66)
    for i, (role, x, z) in enumerate([('r-sc', 140, .62), ('r-ex', 196, .47), ('r-ve', 252, .32)]):
        R.pup(role, x, z, 3.4, 'queue', i * 4, tag='<b>the coffee queue</b><br>3 finished agents, 1 slow machine' if i == 2 else '')
    R.say(222, 148, 'It has one job.', 1, '')
    R.pup('r-bu', 334, .62, 4, 'chat', 0)
    R.tag(236, R.base(.62) + 3, '<b>builder</b> · sent home by you, 14:02<br>taking it well. Telling everyone.')
    R.pup('r-lead t-mos', 64, .12, 4, 'phone', 0, lift=26 + (26 if g.SHAPE == 's-mochi' else 0))
    R.put('sofa', 30, .1, 150, 46)
    R.tag(34, R.base(.1) + 3, '<b>Changelog draft</b> · finished, PR #218<br>closed? No. Scrolling? Yes.')
    R.say(6, R.base(.12) - 150, 'Done. Vibing until someone closes me.', 3, 'z')
    R.put('plant', 390, .15, 34, 30)
    # --- mossy-docs
    R = sc.room('mos', 'mossy-docs', '2 sessions · $1.50', 'rm-mos')
    R.raw('<div class="door" style="left:310px"></div>')
    R.wall('win', 180, 16, 110, 76)
    R.sign(14, 124, 118, '<b>The compactor</b>Memories in. Vibes out.', 'y')
    top = session(R, 210, .62, 't-mos', None, 'Changelog draft', 'finished · PR #218 · $0.65 · gone to the kitchen', 'off', 'cld', 0,
                  kids=kid('flagp', 20) + '<span class="dnote" style="left:44px">gone to lunch. Forever.</span>', seated=False, labx=150)
    R.put('shred', 40, .32, 54, 58)
    y = R.pup('r-lead t-mos', 84, .14, 4.4, 'shred', 0)
    for i, (dx, c) in enumerate([(-30, 'l'), (10, 'm'), (30, '')]):
        R.raw(FLY.replace('class="fly"', 'class="fly %s"' % c) % (84 + 30 + dx, y + 10, i * .5))
    R.lab(60, y - 2, 'Docs sweep', 'compacting · Haiku · cloud · $0.85', '')
    R.say(180, y + 62, 'Who needs the first three hours anyway.', 2, '')
    # --- kettle-api: asleep, and so is the plant
    R = sc.room('ket', 'kettle-api', '1 session · $1.05', 'rm-ket')
    R.raw('<div class="door" style="left:280px"></div>')
    R.wall('win', 150, 16, 110, 76)
    R.sign(14, 12, 118, '<b>Idle: 31 min</b>Plant: also idle.', '')
    top = session(R, 110, .45, 't-ket', 'nap', 'Webhook spike', 'idle 31 min · Fable · cloud · resting its context', 'zzz', 'cld', 1)
    R.raw('<div class="web" style="left:204px;top:%dpx"></div>' % (top - 6))
    R.say(214, top + 44, 'zzz… webhooks… zzz', 3, '', think=True)
    R.put('plant dead', 40, .42, 34, 30)
    R.raw('<div class="leaf" style="left:84px;top:%dpx"></div><div class="leaf" style="left:16px;top:%dpx;transform:rotate(40deg)"></div>' % (R.base(.42) + 2, R.base(.42) + 12))
    R.tag(20, R.base(.42) + 28, '<b>plant</b><br>last watered when this room was busy')
    # --- world
    W, H = V['W'], V['H']
    w = ['<div class="lawn" style="left:-2400px;top:-1600px;width:%dpx;height:%dpx"></div>' % (W + 4800, H + 3200),
         '<div class="slab" style="left:18px;top:18px;width:%dpx;height:%dpx;border-radius:16px"></div>' % (W - 36, H - 36),
         '<div class="hall" style="left:30px;top:430px;width:%dpx;height:130px"></div>' % (W - 60)]
    w += [r.html() for r in sc.rooms]
    w.append(sc.walk_html(1010, 1420, 528, 60, 9, [('r-sc', 'scoutrun', 0, 3.6, 0)], '<b>scout</b><br>find usages of paginate'))
    w.append(sc.walk_html(640, 300, 520, 59, 16, [('r-ex', 'stroll', 0, 3.6, 0)], '<b>explorer</b> · finished<br>the nap pod is taken. It will wait.', -3))
    w.append(sc.walk_html(1300, 760, 532, 61, 8, [('r-sc', 'runmug', 0, 3.4, 0)], '<b>scout</b> · finished<br>skipped the queue. Bold.', -1))
    return sc, ''.join(w)


TREE_F = [('', 'r-lead t-lan', 'frantic', '<b>Ship release 2.4</b> · lead · Opus<br>do not disturb. It means it.'),
          ('t2', 'r-bu', 'hammer', '<b>builder</b> · Opus · own worktree<br>settings screen · rejected twice, hammering anyway'),
          ('t2', 'r-bu', 'grump', '<b>builder</b> · Sonnet · own worktree<br>export endpoint · build at minute 40'),
          ('t2', 'r-sc', 'scout', '<b>scout</b> · Haiku<br>find callers of saveDraft · delegated it'),
          ('t3', 'r-sc', 'scout', '<b>scout</b> · Haiku<br>also delegated it'),
          ('t4', 'r-sc', 'kidlook', '<b>scout</b> · Haiku<br>actually looking. Somebody had to.'),
          ('t2', 'r-rv', 'reject', '<b>reviewer</b> · Opus · meeting room<br>PR #212: same diff, same no'),
          ('t2', 'r-de', 'paint', '<b>designer</b> · Opus<br>empty state · moved it two pixels'),
          ('t2', 'r-ve', 'stall', '<b>verifier</b> · Sonnet<br>staging walkthrough · no output for 9 min')]
TIX_F = ('<b>14:31</b> A scout hired a scout, who hired a scout. One of them is looking. · <b>14:29</b> PR #212 rejected again. Same diff, same no. · '
         '<b>14:24</b> orbit-kit opened PR #219. There was confetti. · <b>14:22</b> Flaky login test, retry 5 of 5. It remains flaky. · '
         '<b>13:52</b> A build started. It is still the build.')
TIX_S = ('<b>14:24</b> orbit-kit opened PR #219. There was confetti. · <b>14:24</b> lanternfish opened PR #214. · '
         '<b>14:22</b> Flaky login test failed for the third time. It remains flaky. · <b>14:02</b> You sent a builder home. It is taking it well, by the water cooler. · '
         '<b>14:01</b> Webhook spike has been asleep on its keyboard for 31 minutes.')


TREE = [('', 'r-lead t-lan', 'frantic', '<b>Ship release 2.4</b> · lead · Opus<br>typing like the building is on fire'),
        ('t2', 'r-bu', 'hammer', '<b>builder</b> · Opus · own worktree<br>migrate settings screen'),
        ('t3', 'r-sc', 'scout', '<b>scout</b> · Haiku<br>find callers of saveDraft'),
        ('t4', 'r-ex', 'kidlook', '<b>explorer</b> · Haiku<br>grep legacy/ for saveDraft'),
        ('t2', 'r-bu', 'hammer', '<b>builder</b> · Sonnet · own worktree<br>new export endpoint'),
        ('t3', 'r-ve', 'verify', '<b>verifier</b> · Sonnet<br>run export tests'),
        ('t2', 'r-rv', 'review', '<b>reviewer</b> · Opus · in the meeting room<br>read diff for PR #212'),
        ('t2', 'r-de', 'paint', '<b>designer</b> · Opus<br>empty state for exports'),
        ('t2', 'r-ve', 'verify', '<b>verifier</b> · Sonnet<br>walkthrough on staging')]


def board(g, vk, cam0, t0=0, tick=True):
    sc, world = (build_side if vk == 'side' else build_floor)(g)
    V = sc.V
    keys = list(ROOMS[vk].keys())
    tree = ''.join('<div class="trow %s">%s<div>%s</div></div>' % (c, g.pup(r, sc.act(l, i * 2)), t) for i, (c, r, l, t) in enumerate(TREE if vk == 'side' else TREE_F))
    hint = 'Click a room, or the release desk, to get closer.' if cam0 == 'c-all' else 'Whole office takes you back out.'
    body = (
        '<div class="bb app %s {{cam}}" style="width:1440px;height:900px">'
        '<div class="world %s" style="width:%dpx;height:%dpx">%s</div>'
        '<div class="hud"><span class="mark">Busybodies</span><span class="pill">14:32</span><span class="pill">9 sessions · 12 agents out</span>'
        '<span class="pill">$63.20 today</span><span class="pill">4 PRs</span><span class="pill hot" onClick="{{goBre}}">1 needs you</span>'
        '<span style="flex:1"></span><span class="hint">%s</span><a class="btn" href="%s">%s</a><span class="btn {{onAll}}" onClick="{{goAll}}">Whole office</span>'
        '<span class="btn" onClick="{{next}}">Next room</span></div>'
        '<div class="sidep"><h3>Ship release 2.4</h3><div class="meta">lanternfish · release/2.4 · desktop · Opus · since 09:12</div>'
        '<div class="meta"><b>$41.20</b> · +3,412 −1,208 · PR #212 in review · PR #214 opened 14:24</div>'
        '<div class="meta">8 out now · 143 hired today: 134 finished, 1 sent home by you at 14:02</div>'
        '<h4>Who hired whom</h4>%s</div>'
        '<div class="dock"><div class="fnote"><small>Note on the fridge</small>Crumb cache has had its hand up for 10 minutes. It’s fine. Its arm is tired, but it’s fine.</div>'
        '<div class="ask"><div><strong>Crumb cache rewrite needs you</strong>“May I run rm -rf dist?” Asked 10 minutes ago, politely.</div>'
        '<span class="btn" onClick="{{goBre}}">Go to the room</span></div>'
        '<div class="tix">%s</div></div>'
        '</div>') % ('side-app' if vk == 'side' else 'floor-app', V['cls'], V['W'], V['H'], world, V['name'], 'FloorBusy.dc.html' if vk == 'side' else 'SideBusy.dc.html', 'See layout 2' if vk == 'side' else 'See layout 1', tree, TIX_S if vk == 'side' else TIX_F)
    js = g.js_head(g.LOOPS, sc.actors, t0, tick) + '''const cam = s.cam || '%s';
const R = %s;
v.cam = cam;
v.onAll = cam === 'c-all' ? 'on' : '';
const go = (c) => (e) => { if (e && e.stopPropagation) e.stopPropagation(); this.setState({ cam: c }); };
for (const r of R) v['go' + r.charAt(0).toUpperCase() + r.slice(1)] = go('c-' + r);
v.goAll = go('c-all');
v.goRel = go('c-rel');
v.next = () => { const i = R.indexOf(cam.slice(2)); this.setState({ cam: 'c-' + R[(i + 1) %% R.length] }); };
return v;
}
}''' % (cam0, json.dumps(keys))
    return g.doc('Busybodies, %s' % V['name'], 1440, 900, body, js)


def build(g):
    for vk, a, b in (('side', 'SideBusy', 'SideRoom'), ('floor', 'FloorBusy', 'FloorRoom')):
        g.SHAPE = g.PICK if vk == 'floor' else ''   # the open floor is drawn with the chosen body; the cutaway keeps the round-2 bean
        g.write(a + '.dc.html', board(g, vk, 'c-all'))
        g.write(b + '.dc.html', board(g, vk, 'c-rel'))
        for cam in ['lan', 'bre', 'kit', 'orb'] + (['lan2', 'mos'] if vk == 'side' else ['mos', 'ket', 'lob', 'mtg']):
            with open(os.path.join(g.PREV, '%s@%s.dc.html' % (a, cam)), 'w') as f:
                f.write(board(g, vk, 'c-' + cam, t0=7).replace('</helmet>', '<style>.g3{animation-delay:-1s}.g1{animation-delay:-8.5s}</style></helmet>'))
        g.SHAPE = ''
