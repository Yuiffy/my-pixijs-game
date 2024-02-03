'use client';

import {BlurFilter} from 'pixi.js';
import {Stage, Container, Sprite, Text, useTick} from '@pixi/react';
import {useReducer, useRef} from 'react';

const reducer = (_: any, {data}: any) => data;

const Bunny = () => {
    const [motion, update] = useReducer(reducer, {
        type: 'init',
        data: {
            x: 0,
            y: 0,
            rotation: 0,
            anchor: 0,
        },
    });
    const iter = useRef(0);

    useTick((delta) => {
        const i = (iter.current += 0.05 * delta);
        const step = 35
        update({
            type: 'update',
            data: {
                x: Math.sin(i) * step,
                y: Math.sin(i / 1.5) * step,
                rotation: Math.sin(i) * Math.PI,
                anchor: Math.sin(i / 2),
            },
        });
    });

    return <Sprite image={'/images/sui-bird-jump.png'} scale={0.5} {...motion} />;
};

const BirdBasePage = () => {
    return (
        <Stage width={1920} height={1080} options={{backgroundAlpha: 0}}>
            <Container x={960} y={540}>
                <Bunny/>
            </Container>
        </Stage>
    );
};

export default BirdBasePage;
