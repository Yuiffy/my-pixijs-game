import {BlurFilter} from 'pixi.js';
import {Stage, Container, Sprite, Text, useTick} from '@pixi/react';
import {useReducer, useRef} from 'react';
import suiBirdJump from './resources/images/sui_bird_jump.png';

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

    return <Sprite image={suiBirdJump} scale={0.5} {...motion} />;
};

export const Game = () => {
    return (
        <Stage width={1024} height={768} options={{backgroundAlpha: 0}}>
            <Container x={512} y={384}>
                <Bunny/>
            </Container>
        </Stage>
    );
};
