'use client';

import {
  Stage, Container, Sprite, useTick,
} from '@pixi/react';
import { useEffect, useReducer, useRef } from 'react';
import Matter, { Runner } from 'matter-js';

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

  useEffect(() => {
    // Matter.js
    const engine = Matter.Engine.create();
    const box = Matter.Bodies.rectangle(150, 0, 50, 50); // x y w h
    const ground = Matter.Bodies.rectangle(
      // x   y    w    h    options
      -2000, 1080, 5000, 120, { isStatic: true });
    const mouseConstraint = Matter.MouseConstraint.create(engine, {
      element: document.body,
    });
    Matter.Composite.add(engine.world, [box, ground, mouseConstraint]);
    boxRef.current = box;

    // create runner
    const runner = Runner.create();

    // run the engine
    Runner.run(runner, engine);
  }, []);

  useTick((delta) => {
    const box = boxRef?.current;
    update({
      type: 'update',
      data: {
        x: box?.position.x,
        y: box?.position.y,
        rotation: box?.angle,
        anchor: 1,
      },
    });
  });

  return <Sprite image="/images/sui-bird-jump.png" scale={0.5} {...motion} />;
}

function BirdBase() {
  return (
    <Stage width={1920} height={1080} options={{ backgroundAlpha: 0 }}>
      {/*<Container x={960} y={540}>*/}
        <Bunny />
      {/*</Container>*/}
    </Stage>
  );
}

export default BirdBase;
