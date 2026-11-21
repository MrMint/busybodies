import json
P = 'boards/canvas.json'
c = json.load(open(P))
new = [
 ('Cast.dc.html', 0, 4000, 1440, 900, 'D1 Busybodies · the cast'),
 ('Acting.dc.html', 1520, 4000, 1440, 1440, 'D2 Busybodies · acted poses'),
 ('SideBusy.dc.html', 0, 5760, 1440, 900, 'E1 Layout 1 · Cutaway · busy day'),
 ('SideRoom.dc.html', 1520, 5760, 1440, 900, 'E2 Layout 1 · Cutaway · zoomed room'),
 ('FloorBusy.dc.html', 0, 6960, 1440, 900, 'F1 Layout 2 · Open floor · busy day'),
 ('FloorRoom.dc.html', 1520, 6960, 1440, 900, 'F2 Layout 2 · Open floor · zoomed room'),
]
for f, x, y, w, h, t in new:
    c['boards'][f] = {'x': x, 'y': y, 'w': w, 'h': h, 'title': t, 'is_interactive': True}
    if f not in c['order']:
        c['order'].append(f)
n = c['notes']
n['titleA']['text'] = 'A · Pixel Tower (round 1, dropped)'
n['titleB']['text'] = 'B · Cut Paper (round 1, the favourite)'
n['titleC']['text'] = 'C · Putty (round 1, dropped)'
n['intro']['text'] = n['intro']['text'].replace('Scurry (placeholder name)', 'Busybodies').replace(
    'Three rendering styles', 'Round 1. Three rendering styles')
n['titleD'] = {'x': 0, 'y': 3740, 'text': 'D · Round 2 · Cut Paper characters, pushed', 'kind': 'title1', 'maxW': 2960}
n['titleE'] = {'x': 0, 'y': 5500, 'text': 'E · Office layout 1 · Cutaway', 'kind': 'title1', 'maxW': 2960}
n['titleF'] = {'x': 0, 'y': 6700, 'text': 'F · Office layout 2 · Open floor', 'kind': 'title1', 'maxW': 2960}
n['intro2'] = {'x': -640, 'y': 4000, 'w': 520, 'fill': 'blue', 'size': 'm', 'text':
 "Busybodies · round 2\n\n"
 "Cut Paper won. Rows D to F answer the two asks: characters that can act, and an office you can walk around in.\n\n"
 "Row D: the cast (every role, hard at it and slacking) and nine acted poses.\n"
 "Rows E and F: the same invented day at 14:32, in two office layouts. Each has a busy day and a zoomed room.\n\n"
 "Press Play on any board. On a busy day: click a room to walk the camera into it, click the release desk for the closest view, \"Whole office\" to pull back, \"Next room\" to tour. The top-right button swaps to the other layout.\n\n"
 "What to look for: breadbox has had its hand up for 10 minutes (yellow paddle, pulsing room, fridge note). lanternfish and orbit-kit are in a frenzy. kettle-api is asleep on the keyboard and the kitchen is full of people who have finished.\n\n"
 "Every name and number is made up."}
n['howD'] = {'x': 3040, 'y': 4000, 'w': 520, 'fill': 'gray', 'text':
 "How the puppet works\n\n"
 "Each character is about 18 paper parts: body, two eyes, pupils, brows, cheeks, mouth, two arms, two held items, feet, hat or glasses, and a few effects. In the app each part is one sprite in a container, all from one sheet.\n\n"
 "A pose is a list of frames. A frame only names what each part does (eyes wide, brows worried, left arm up, holding a sign). Parts spring to the new frame, so motion stays smooth and bouncy instead of stepping. The live frame is printed under each stage on D2.\n\n"
 "Role is costume, not shape: lead wears the project tie, builder a hard hat, scout binoculars, reviewer glasses and a clipboard, verifier a visor and a magnifier, designer a beret, explorer a pith helmet and a torch. Depth is size: a subagent's subagent is smaller.\n\n"
 "A new pose is a new list of frames. A new costume is one or two new parts."}
n['howE'] = {'x': 3040, 'y': 5760, 'w': 520, 'fill': 'gray', 'text':
 "Layout 1 · Cutaway\n\n"
 "A building with the front wall off, seen side-on. One room per project, a meeting room for reviews, a kitchen for the idle and the finished, a dispatch desk on the roof.\n\n"
 "For: reads as a building at once. Characters and rooms share one flat viewpoint, so nothing cheats. Walking between rooms is simple.\n"
 "Against: everyone stands on one floor line, so a busy project gets wide, not deep. lanternfish needed a second floor. More floors means smaller characters.\n\n"
 "In the app: drag to pan, wheel to zoom, click a room or desk to move in. These boards use fixed camera stops instead."}
n['howF'] = {'x': 3040, 'y': 6960, 'w': 520, 'fill': 'gray', 'text':
 "Layout 2 · Open floor\n\n"
 "One office floor seen from above and in front. Back walls with windows and whiteboards, a hallway through the middle, a lobby with the day's tally.\n\n"
 "For: rooms have depth, so a busy project fills two or three rows of desks. The hallway and lobby make it feel walked through. Characters are about 13% bigger at whole-office zoom.\n"
 "Against: people in front can cover people behind, so labels need more care. A very large day needs a second floor or a longer hallway.\n\n"
 "How to read either office: the screen on a desk shows where the session started (desktop, terminal, cloud). Coffee cups are cost. A bonsai means its own worktree. Yellow paddle and a pulsing room mean it needs you. The kitchen holds the idle, the finished and the sent home."}
json.dump(c, open(P, 'w'), indent=1, ensure_ascii=False)
print(len(c['boards']), len(c['order']), sorted(n))
