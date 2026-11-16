document.addEventListener("keydown", (event) => {
  if (event.key.toLowerCase() === "s") {
    shuffle();
  }
});

function startMove(axisIdx, layer, dir, dur = 140) {
  const slice = cubies.filter(
    c => Math.round(c.position.getComponent(axisIdx)) === layer
  );
  pivot.quaternion.identity();
  slice.forEach(c => pivot.attach(c));
  anim = {
    from: 0,
    to: dir * Math.PI / 2,
    axis: AXES[axisIdx],
    slice,
    t0: performance.now(),
    dur
  };
}

const shuffleQueue = [];
let lastMove = null;

function shuffle(count = 25) {
  if (anim || drag || shuffleQueue.length) return;
  for (let i = 0; i < count; i++) {
    let m;
    do {
      m = {
        axis: Math.floor(Math.random() * 3),
        layer: Math.floor(Math.random() * 3) - 1,
        dir: Math.random() < 0.5 ? -1 : 1
      };
    } while (lastMove && m.axis === lastMove.axis && m.layer === lastMove.layer);
    shuffleQueue.push(m);
    lastMove = m;
  }
  lastMove = null;
  nextShuffleMove();
}

function nextShuffleMove() {
  const m = shuffleQueue.shift();
  if (m) startMove(m.axis, m.layer, m.dir);
}