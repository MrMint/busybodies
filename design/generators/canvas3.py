import json
P = 'boards/canvas.json'
c = json.load(open(P))
new = [
 ('Lines.dc.html', 3640, 6960, 1440, 1120, 'F3 Layout 2 · Open floor · the line bank', False),
 ('Shapes.dc.html', 0, 8420, 1440, 900, 'G1 Body shapes · gumdrop, mochi, dumpling', True),
 ('ShapeRoomGum.dc.html', 1520, 8420, 1440, 900, 'G2 Zoomed room · gumdrop bodies', True),
 ('ShapeRoomMochi.dc.html', 3040, 8420, 1440, 900, 'G3 Zoomed room · mochi bodies', True),
 ('ShapeRoomDump.dc.html', 4560, 8420, 1440, 900, 'G4 Zoomed room · dumpling bodies', True),
]
for f, x, y, w, h, t, play in new:
    b = {'x': x, 'y': y, 'w': w, 'h': h, 'title': t}
    if play:
        b['is_interactive'] = True
    c['boards'][f] = b
    if f not in c['order']:
        c['order'].append(f)
n = c['notes']
n['titleF']['text'] = 'F · Office layout 2 · Open floor (the direction)'
n['titleE']['text'] = 'E · Office layout 1 · Cutaway (not chosen)'
n['titleG'] = {'x': 0, 'y': 8160, 'text': 'G · Round 3 · Body shapes', 'kind': 'title1', 'maxW': 2960}
n['intro3'] = {'x': -640, 'y': 6960, 'w': 520, 'fill': 'blue', 'size': 'm', 'text':
 "Busybodies · round 3\n\n"
 "Open floor is the direction. F1 and F2 are redrawn with the sass turned up, F3 is the line bank behind it, and row G is the body-shape question.\n\n"
 "New in the office: speech and thought bubbles that react to what an agent is doing, signs and tallies on the walls, notes on desks, and background gags (the coffee queue, the nap pod, a plant that gave up in the idle room, cobwebs on a stalled verifier, a do-not-disturb sign on the frantic desk).\n\n"
 "Bubbles take turns, so press Play and wait a few seconds. At whole-office zoom only the short ones show; click a room to see the rest, plus the name tags, which carry jokes too.\n\n"
 "Row G: gumdrop, mochi and a cross of the two, then the same zoomed room three times, once in each body. My pick is on G1."}
n['howG'] = {'x': 6080, 'y': 8420, 'w': 520, 'fill': 'gray', 'text':
 "Body shapes\n\n"
 "Six bodies were drawn on one rig. After the first look, gumdrop and mochi went through; bean, chibi and pear are dropped and shown small on G1 for the record.\n\n"
 "Dumpling is the hybrid: gumdrop's upright ball and shoulders on mochi's soft, wide base. Mochi and dumpling also wobble gently all the time and squash and stretch further than gumdrop. That only shows in Play.\n\n"
 "G2 to G4 are the same room and the same moment in each body, so the only difference is the shape. Rows A to F still use the round-2 bean.\n\n"
 "A shape is one body cut-out and a handful of attachment points. Faces, costumes, props and every pose are shared, so switching later is cheap."}
json.dump(c, open(P, 'w'), indent=1, ensure_ascii=False)
print(len(c['boards']), len(c['order']))
