"""Round 3: the line bank and the body-shape comparison."""

# kind: s = says, t = thinks, n = sign or note. (kind, line, who / when)
BANK = [
    ('Waiting on you', 'r-lead t-bre', 'bg-bre', 'e-half l-right b-one m-pout',
     'A permission prompt or a question is up. Lines get needier with the wait, never ruder.', [
         ('s', 'Whenever you are ready.', 'lead · at once'),
         ('s', 'No rush. Some rush.', 'lead · 2 min'),
         ('s', 'Still here. Arm is fine. Arm is thriving.', 'lead · 10 min'),
         ('t', 'They have a life. I respect that. I have a paddle.', 'lead'),
         ('s', 'I will name a variable after you.', 'rare variant'),
         ('n', 'Now serving: nobody. Your number: 1.', 'wall sign')]),
    ('A test failed', 'r-ve', 'bg-lan', 'e-tear b-worry m-wobble',
     'A test run goes red. From the third failure on, the retry lines unlock.', [
         ('s', 'It passed on my machine. I am the machine.', 'verifier'),
         ('s', 'Same line. Same red. Hello again.', 'verifier · 2nd failure'),
         ('s', 'Fifth time is the charm. It was not the charm.', 'lead · retry 5'),
         ('s', 'Flaky is a strong word. Accurate, but strong.', 'lead'),
         ('t', 'What if the test is wrong. What if all tests are wrong.', 'lead'),
         ('s', 'Retrying with confidence. Unearned.', 'lead · retry 3+'),
         ('n', 'Days since a test broke: 0', 'whiteboard tally')]),
    ('A very long build', 'r-bu', 'bg-orb', 'e-half b-flat m-pout',
     'One command has been running for 20 minutes or more. The clock fx comes with it.', [
         ('t', 'Minute 40. I have aged.', 'builder · 40 min'),
         ('s', 'It is fine. I love waiting.', 'builder · 20 min'),
         ('s', 'The progress bar and I have stopped speaking.', 'builder · 30 min'),
         ('t', 'I could have written a faster build by now. Twice.', 'builder'),
         ('n', 'A build started at 13:52. It is still the build.', 'event ticker')]),
    ('PR opened', 'r-lead t-orb', 'bg-orb', 'e-star b-up c-blush m-grin',
     'A pull request goes up. Trophy lap, confetti, then smugness.', [
         ('s', 'PR #219. Frame it.', 'lead'),
         ('s', 'Ship it before it changes its mind.', 'lead'),
         ('s', 'Opened. I am told people read these.', 'lead'),
         ('s', 'I would like to thank my scout. And my other scout.', 'lead'),
         ('n', 'PRs today: 4. Humility: 0.', 'wall sign')]),
    ('Review comes back', 'r-rv', 'bg-mos', 'e-half l-right b-one m-flat',
     'A reviewer finishes a pass. Rejecting the same diff twice has its own lines.', [
         ('s', 'Same diff. Same no.', 'reviewer · 2nd rejection'),
         ('s', 'I have notes. I have so many notes.', 'reviewer'),
         ('s', 'Rejected, with love. Mostly with notes.', 'reviewer'),
         ('s', 'Approved. Do not make it weird.', 'reviewer · pass'),
         ('t', 'Rejected twice. It was a good comma.', 'the builder'),
         ('n', 'This meeting could have been a diff.', 'meeting room sign')]),
    ('Hiring a subagent', 'r-sc', 'bg-bre', 'e-shine b-up m-grin',
     'An agent spawns another. Depth two and three get the delegation jokes.', [
         ('s', 'One job. Find saveDraft.', 'lead · hiring'),
         ('s', 'Bring it back in one piece.', 'lead · hiring'),
         ('s', 'A scout for my scout’s scout.', 'scout · three deep'),
         ('s', 'I delegated.', 'scout'), ('s', 'So did I.', 'its scout'),
         ('t', 'Actually looking. Somebody had to.', 'the last scout'),
         ('n', 'Caution: scouts running', 'wall sign')]),
    ('Stalled', 'r-ve', 'bg-kit', 'e-wide l-up m-small',
     'No output for 5 minutes while still marked busy. Cobwebs at 9.', [
         ('t', '…', 'anyone · 5 min'),
         ('s', 'I am thinking. It is a process. Do not rush the process.', '7 min'),
         ('s', 'No output for 9 minutes. I am being mysterious.', '9 min'),
         ('n', 'Not frozen. Buffering with intent.', 'desk note, appears by itself')]),
    ('Idle', 'r-lead t-ket', 'bg-ket', 'e-closed m-drool',
     'Nothing to do. Under 10 minutes: feet up. After: asleep on the keys.', [
         ('t', 'This is a planning phase. The plane is part of the plan.', 'feet up'),
         ('s', 'Feet up is a valid posture for deep work.', 'feet up'),
         ('t', 'zzz… webhooks… zzz', 'asleep'),
         ('s', 'I was resting my context.', 'woken up'),
         ('n', 'Idle: 31 min. Plant: also idle.', 'wall sign, long-idle room'),
         ('n', 'Last watered when this room was busy.', 'the plant')]),
    ('Compacting', 'r-lead t-mos', 'bg-mos', 'e-wide b-worry m-flat',
     'The session is squeezing its memory. Paper goes in the shredder.', [
         ('s', 'Who needs the first three hours anyway.', 'lead'),
         ('s', 'Forgetting things on purpose. Very healthy.', 'lead'),
         ('s', 'If I ask who you are in a minute, that is why.', 'lead'),
         ('n', 'The compactor. Memories in. Vibes out.', 'sign on the shredder')]),
    ('Crashed', 'r-lead t-orb', 'bg-orb', 'e-dead c-pale m-wobble',
     'The session errored out. Smoke, and a small apology.', [
         ('s', 'oops', 'always'),
         ('s', 'I renamed the rename. Then it renamed me.', 'Rename everything'),
         ('s', 'It worked until it very much did not.', 'lead'),
         ('s', 'I regret several things, alphabetically.', 'lead'),
         ('s', 'Technically everything is renamed. Technically.', 'lead')]),
    ('Finished, still open', 'r-lead t-mos', 'bg-kit', 'e-half l-down b-flat m-smirk',
     'The work is done and nobody has closed the session. It drifts to the kitchen.', [
         ('s', 'Done. Vibing until someone closes me.', 'lead · on the sofa'),
         ('s', 'Finished at 14:10. Scrolling since 14:11.', 'lead'),
         ('s', 'My PR is up. My feet are also up.', 'lead'),
         ('n', 'Gone to lunch. Forever.', 'note on the empty desk'),
         ('n', 'Finished? Close your own session.', 'kitchen sign')]),
    ('Paused or sent home', 'r-bu', 'bg-kit', 'l-left e-half b-one m-pout',
     'You stopped or paused an agent. It takes it well. Loudly.', [
         ('s', 'Sent home at 14:02. Taking it well. Telling everyone.', 'builder · water cooler'),
         ('s', 'Paused? I prefer “on sabbatical”.', 'scout'),
         ('s', 'I was this close. I was not this close.', 'builder'),
         ('s', 'Wheee.', 'paused scout, in the chair')]),
    ('The coffee queue', 'r-ex', 'bg-kit', 'e-half l-up b-one m-pout',
     'Three or more finished agents in the kitchen at once.', [
         ('s', 'It has one job.', 'first in line'),
         ('s', 'The machine is thinking. We know the feeling.', 'second in line'),
         ('s', 'Skipped the queue. Bold.', 'about the one running past'),
         ('n', 'One cup per green build.', 'sign on the machine')]),
    ('Reactions to each other', 'r-de', 'bg-lan', 'e-half l-right b-flat m-flat',
     'An agent near a slacker, a party or a crash plays one of these.', [
         ('t', 'Must be nice.', 'side-eye at feet up'),
         ('s', 'It is one PR.', 'eye roll at the confetti'),
         ('s', 'Up top.', 'high five · green build'),
         ('s', 'Green. Nobody touch anything.', 'after the high five'),
         ('t', 'Not my room. Not my smoke.', 'walking past a crash')]),
    ('The bill', 'r-lead t-lan', 'bg-lan', 'e-closed b-worry m-small',
     'Cost shows as coffee cups on the desk. Past five cups the session gets self-aware.', [
         ('s', 'Cup five. I am worth every one.', 'lead · $40+'),
         ('t', 'Do not look at the cups. Look at the PR.', 'lead'),
         ('n', 'Do not disturb.', 'on a frantic desk'),
         ('n', 'Employee of the month: nobody. Again.', 'lobby frame')]),
    ('Notes on the fridge', 'r-sc', 'bg-face', 'e-happy m-grin',
     'One note in the dock, about whatever most needs a human or most deserves a roast.', [
         ('n', 'Crumb cache has had its hand up for 10 minutes. It’s fine. Its arm is tired, but it’s fine.', ''),
         ('n', 'Whoever left a build running since 13:52: it is still running.', ''),
         ('n', 'Scouts: please stop hiring scouts.', ''),
         ('n', 'Webhook spike is not asleep. It is “resting its context”. For 31 minutes.', '')]),
]

DROPPED = [
    ('', 'Bean', 'The round-2 body. Tall, and it reads a bit grown-up.'),
    ('s-gum', 'Gumdrop', 'A ball with shoulders. The best actor of the six, and the plainest of the last three.'),
    ('s-dump', 'Dumpling', 'Gumdrop crossed with mochi. Close, but mochi has more character.'),
    ('s-chibi', 'Chibi', 'Cutest face up close, but its short arms crowd it and costumes shrink to dots.'),
    ('s-pear', 'Pear', 'A natural grump. Hats and headset sit loose on the narrow top.'),
]


def lines_board(g):
    cards = []
    n = 0
    for title, role, bg, face, when, lines in BANK:
        n += len(lines)
        ps = ''.join('<p class="%s">%s%s</p>' % ({'s': '', 't': 't', 'n': 's'}[k], t, ' <small>%s</small>' % w if w else '') for k, t, w in lines)
        cards.append('<div class="lg"><h3><span class="hd %s">%s</span>%s</h3><div class="when">%s</div>%s</div>'
                     % (bg, g.pup(role + ' ' + face, shape=g.PICK), title, when, ps))
    body = ('<div class="bb sheet" style="width:1440px;height:1120px;gap:9px">'
            '<h1>Busybodies · the line bank</h1>'
            '<p class="lede">%d lines, grouped by what sets them off. The tone is an affectionate roast of the agents: they are needy, smug, dramatic and lazy, '
            'and they know it. The person at the keyboard is never the punchline, and nothing is crude. A line plays in a bubble for a few seconds, then gives way; '
            'the same agent does not repeat a line within the hour, and at whole-office zoom only the shortest ones show.</p>'
            '<div class="key"><span>says it</span><span class="t">thinks it</span><span class="s">sign, note or tally in the room</span></div>'
            '<div class="lines">%s</div></div>') % (n, ''.join(cards))
    return g.doc('Busybodies, the line bank', 1440, 1120, body, 'class Component extends DCLogic {\nrenderVals() { return {}; }\n}'), n


def shapes_board(g, t0=0, tick=True):
    actors = {}
    M = g.PICK

    def act(loop, off=0):
        k = 's%d' % (len(actors) + 1)
        actors[k] = [loop, off]
        return k
    cast = g.pup('r-lead t-lan', act('showlead'), x=20, y=132, fs=7.6, shape=M)
    for role, loop, off, x, fs in (('r-bu', 'hammer', 2, 186, 5.6), ('r-sc', 'scout', 1, 304, 5.6), ('r-ex', 'kidlook', 0, 426, 4.8),
                                   ('r-rv', 'review', 0, 526, 5.6), ('r-ve', 'verify', 3, 646, 5.6), ('r-de', 'paint', 1, 762, 5.6)):
        cast += g.pup(role, act(loop, off), x=x, y=132 + 25 * (7.6 - fs), fs=fs, shape=M)
    lazy = (g.pup('r-lead t-ket fr-desk', act('nap', 3), x=26, y=58, fs=4.8, shape=M) + g.pup('r-lead t-mos', act('phone', 2), x=170, y=58, fs=4.8, shape=M)
            + g.pup('r-bu', act('grump', 1), x=296, y=58, fs=4.8, shape=M))
    mini = ('<span class="it desk" style="left:24px;top:134px;width:74px;height:26px"></span>'
            + g.pup('r-lead t-lan', act('frantic', 1), x=30, y=70, fs=3.1, shape=M)
            + g.pup('r-bu', act('hammer', 5), x=122, y=88, fs=2.83, shape=M) + g.pup('r-sc', act('scoutrun', 0), x=194, y=88, fs=2.83, shape=M)
            + g.pup('r-ve', act('verify', 1), x=266, y=88, fs=2.83, shape=M) + g.pup('r-rv', act('reject', 1), x=338, y=88, fs=2.83, shape=M))
    left = ('<div class="cell"><div class="stage bg-lan" style="height:350px">%s<div class="cap">the mochi cast, zoomed in</div></div>'
            '<div class="duo"><div class="stage bg-kit" style="height:186px">%s<div class="cap">off duty</div></div>'
            '<div class="stage bg-bre" style="height:186px">%s<div class="cap">at whole-office zoom</div></div></div>'
            '<h3>Mochi · chosen</h3><div class="meta"><b>Soft, squat and wide.</b> Wider than it is tall, flat on its feet, face sat low and 12%% bigger, and it never quite stops wobbling. '
            'It squashes and stretches further than the other bodies, which is where the springy motion pays off: the funniest runner and the best napper of the six. '
            'Same rig as before: jointed arms and legs, the same face parts, the same costumes and the same frames.</div></div>') % (cast, lazy, mini)
    old = ''.join('<div class="stage" style="height:118px;background-color:#dfe5f3">%s%s%s</div><div class="meta"><b>%s · dropped.</b> %s</div>'
                  % (g.pup('r-lead t-lan', act('showlead', 3 + i), x=6, y=29, fs=3.4, shape=cls), g.pup('r-bu', act('hammer', i), x=82, y=33, fs=3.2, shape=cls),
                     g.pup('r-sc', act('scout', i), x=158, y=33, fs=3.2, shape=cls), name, note)
                  for i, (cls, name, note) in enumerate(DROPPED))
    body = ('<div class="bb sheet" style="width:1440px;height:900px;gap:9px">'
            '<h1>Busybodies · body shapes</h1>'
            '<p class="lede">Six bodies were drawn on one rig, changing only the body cut-out and where the parts attach. Mochi is the one. '
            'The other five are on the right for the record. Boards F1 and F2 are redrawn with the mochi cast.</p>'
            '<div class="shp">%s<div class="old">%s</div></div>'
            '<div class="pickb"><b>What mochi costs, and what was done about it.</b> Its arms start out wide of its face, so a mug reaches the cheek rather than the mouth, and held things sit beside the head; '
            'it reads fine at this size. It has no chest, so ties and vests shrink to a badge under the chin, and roles now read from hats and props. Hats and the headset are widened to fit the head. '
            'Still to do: redraw the cast and acted-poses boards (row D) in mochi and retune the hand-to-face poses one by one.</div>'
            '</div>') % (left, old)
    js = g.js_head(g.LOOPS, actors, t0, tick) + 'return v;\n}\n}'
    return g.doc('Busybodies, body shapes', 1440, 900, body, js)


def build(g):
    import os
    html, n = lines_board(g)
    g.write('Lines.dc.html', html)
    g.write('Shapes.dc.html', shapes_board(g))
    for t in (4, 14):
        with open(os.path.join(g.PREV, 'Shapes@%d.dc.html' % t), 'w') as f:
            f.write(shapes_board(g, t0=t, tick=False))
    print('lines:', n)
