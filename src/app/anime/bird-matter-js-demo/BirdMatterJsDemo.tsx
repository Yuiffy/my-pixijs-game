'use client';

import {
  Stage, Container, Sprite, useTick,
} from '@pixi/react';
import { useEffect, useReducer, useRef } from 'react';
import Matter, {
  Bodies, Common, Composites, Runner,
} from 'matter-js';

const MAX_X = 1920;
const MAX_Y = 1080;

const reducer = (_: any, { data }: any) => data;

function Bunny() {
  const [motion, update] = useReducer(reducer, {
    type: 'init',
    data: [{
      x: 0,
      y: 0,
      rotation: 0,
      anchor: 0,
    }],
  });

  const boxRef: any = useRef(null);
  const stackRef: any = useRef(null);

  useEffect(() => {
    // Matter.js
    const engine = Matter.Engine.create();
    // const box = Matter.Bodies.rectangle(960, -6000, 900, 700, {
    //   density: 0.01,
    //   restitution: 0.5,
    //   friction: 0.01,
    // }); // x y w h
    const box = Bodies.circle(960, -6000, 400, {
      density: 0.01,
      restitution: 0.2,
      friction: 0.01,
    });
    const ground = Matter.Bodies.rectangle(0, 1080 + 60, 5000, 120, { isStatic: true });
    const ground2 = Matter.Bodies.rectangle(-100, 0, 10, 5000, { isStatic: true });
    const ground3 = Matter.Bodies.rectangle(1920 + 100, 0, 10, 5000, { isStatic: true });

    const stack = Composites.stack(
      10,
      -3000,
      15,
      15,
      5,
      5,
      (x: number, y: number) => Bodies.circle(
        x,
        y,
        Common.random(30, 100),
        { restitution: 0.1, friction: 0.1 },
      ),
    );

    // const mouseConstraint = Matter.MouseConstraint.create(engine, {
    //   element: document.body,
    // });
    Matter.Composite.add(engine.world, [
      stack,
      box, ground, ground2, ground3,
      // mouseConstraint
    ]);
    boxRef.current = box;
    stackRef.current = stack;

    // create runner
    const runner = Runner.create();

    // run the engine
    Runner.run(runner, engine);
  }, []);

  useTick((delta) => {
    const box = boxRef?.current;
    const stack = stackRef?.current;
    const stackDataArr = Matter.Composite.allBodies(stack).map((b: Matter.Body) => ({
      id: b.id,
      x: b.position.x,
      y: b.position.y,
      rotation: b.angle,
      anchor: 0.5,
      scale: 0.008 * (b.circleRadius || 50),
    }));
    update({
      type: 'update',
      data: [
        {
          id: 'big',
          x: box?.position.x,
          y: box?.position.y,
          rotation: box?.angle,
          anchor: 0.5,
          scale: 3.3,
        },
        ...stackDataArr,
      ],
    });
  });

  return (
    <>
      {/* <Sprite image="/images/sui-bird-jump.png" scale={0.5} {...motion[0]} /> */}
      {/* <Sprite image="/images/sui-bird-jump.png" scale={1} {...motion[0]} /> */}
      {motion.map && motion.map((m: any, i: number) => <Sprite key={m.id} image="/images/sui-bird-jump.png" {...m} />)}
    </>
  );
}

function BirdBase() {
  // const [motions, update] = useReducer(reducer, {
  //   type: 'init',
  //   data: [{
  //     x: 0,
  //     y: 0,
  //     rotation: 0,
  //     anchor: 0,
  //   }],
  // });
  //
  // useTick((delta) => {
  //   update({
  //     type: 'update',
  //     data: [{
  //       x: Math.random() * MAX_X,
  //       y: Math.random() * MAX_Y,
  //       rotation: Math.random(),
  //       anchor: Math.random(),
  //     }],
  //   });
  // });

  return (
    <Stage width={1920} height={1080} options={{ backgroundAlpha: 0 }}>
      {/* <Container x={960} y={540}> */}
      <Bunny />

      {/* </Container> */}
    </Stage>
  );
}

export default BirdBase;
