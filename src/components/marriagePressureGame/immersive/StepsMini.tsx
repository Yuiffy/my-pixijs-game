"use client";

import { useState } from "react";
import { summarizeSteps, type MiniOption, type StepMini } from "./activityScripts";
import styles from "./immersive.module.css";

interface Props {
  mini: StepMini;
  onDone: (result: MiniOption) => void;
}

// 分步选择：每一步选“体贴”或“竞争”，对方的反应逐步显示，最后给出气氛结果
export default function StepsMini({ mini, onDone }: Props) {
  const [picked, setPicked] = useState<Array<"care" | "push">>([]);
  const [reaction, setReaction] = useState("");
  const index = picked.length;
  const step = mini.steps[Math.min(index, mini.steps.length - 1)];

  const choose = (style: "care" | "push", line: string) => {
    const next = [...picked, style];
    setReaction(line);
    setPicked(next);
  };

  return (
    <div className={styles.timing} data-testid="steps-mini" data-step={index}>
      <p><strong>{mini.title}</strong> · {index + 1 > mini.steps.length ? mini.steps.length : index + 1}/{mini.steps.length}</p>
      {reaction && <p className={styles.dateLine}>{reaction}</p>}
      {index < mini.steps.length && (
        <>
          <p>{step.prompt}</p>
          <div className={styles.dateChoices}>
            {step.choices.map(choice => (
              <button key={choice.id} data-testid={`step-${choice.style}`} onClick={() => choose(choice.style, choice.line)}>{choice.label}</button>
            ))}
          </div>
        </>
      )}
      {index >= mini.steps.length && (
        <button className={styles.primary} data-testid="steps-done" onClick={() => onDone(summarizeSteps(mini, picked))}>结束这一段</button>
      )}
    </div>
  );
}
