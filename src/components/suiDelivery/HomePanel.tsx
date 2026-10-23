import Image from "next/image";
import { useState } from "react";
import { HOME_DECORATIONS, homeKeepsakes, homeNeighbors } from "./home";
import type { HomeActionResult } from "./home";
import type { DeliverySave } from "./types";
import styles from "./home.module.css";

export function RestaurantIllustration({ save }: { save: DeliverySave }) {
  const shown = (id: string) => save.home.displayed.includes(id);
  const gifts = homeKeepsakes(save).map((v) => v.id);
  const dusk = save.delivered.includes("bird-supper");
  return (
    <svg
      className={styles.room}
      viewBox="0 0 760 370"
      role="img"
      aria-label={`春芽小馆，${
        gifts.length
          ? homeKeepsakes(save)
              .map((v) => v.name)
              .join("、")
          : "第一天刚刚开门"
      }${
        save.home.displayed.length
          ? `，摆着${HOME_DECORATIONS.filter((v) => shown(v.id))
              .map((v) => v.name)
              .join("、")}`
          : ""
      }`}
    >
      <rect width="760" height="370" fill="#efddba" />
      <path d="M0 0H760V80Q390 35 0 80Z" fill="#bb7e63" />
      <path
        d="M0 76Q380 32 760 76"
        fill="none"
        stroke="#f6e5c6"
        strokeWidth="7"
      />
      <rect x="44" y="109" width="188" height="172" rx="58" fill="#a98466" />
      <rect
        x="53"
        y="118"
        width="170"
        height="154"
        rx="50"
        fill={dusk ? "#8d9b9e" : "#c8d5b8"}
      />
      <path
        d="M55 234L104 179L155 229L199 168L223 204V272H55Z"
        fill="#9cb092"
      />
      <circle cx="179" cy="154" r="18" fill="#f8dfa0" />
      <path d="M137 118V270M54 200H222" stroke="#a98466" strokeWidth="8" />
      <rect x="30" y="271" width="214" height="12" rx="3" fill="#f7edce" />
      <path d="M0 321H760V370H0Z" fill="#b28c67" />
      <path
        d="M0 342H760M130 322L105 370M350 322L340 370M560 322L580 370"
        stroke="#977653"
        strokeWidth="2"
      />
      <rect x="270" y="231" width="330" height="99" rx="5" fill="#b68159" />
      <rect x="258" y="220" width="354" height="17" rx="5" fill="#f9edcf" />
      <path d="M286 252H584M286 283H584" stroke="#d3aa7a" strokeWidth="3" />
      {shown("red-cloth") && (
        <g data-decoration="red-cloth">
          <path
            d="M264 226H606V274L585 268L564 274L543 268L522 274L501 268L480 274L459 268L438 274L417 268L396 274L375 268L354 274L333 268L312 274L291 268L264 274Z"
            fill="#bd6554"
          />
          {[278, 312, 346, 380, 414, 448, 482, 516, 550, 584].map((x) => (
            <path
              key={x}
              d={`M${x} 227V269`}
              stroke="#f4d1a1"
              strokeWidth="8"
              opacity=".72"
            />
          ))}
          <path
            d="M265 238H605M265 258H605"
            stroke="#f4d1a1"
            strokeWidth="7"
            opacity=".7"
          />
        </g>
      )}
      <ellipse cx="355" cy="214" rx="36" ry="9" fill="#7a8a70" />
      <path d="M327 210Q328 235 355 235Q382 235 383 210" fill="#e7d4ad" />
      <path
        d="M345 199Q335 184 347 177M362 199Q352 184 364 177"
        fill="none"
        stroke="#fff3d6"
        strokeWidth="4"
        strokeLinecap="round"
      />
      <rect x="453" y="189" width="83" height="29" rx="11" fill="#d3a16a" />
      <path
        d="M469 194L476 204M488 194L495 204M507 194L514 204"
        stroke="#f7e3b8"
        strokeWidth="3"
      />
      {gifts.includes("flowers") && (
        <g data-keepsake="flowers">
          <path d="M54 299H119L113 332H61Z" fill="#c18260" />
          {[67, 85, 105].map((x, i) => (
            <g key={x}>
              <path
                d={`M${x} 302V${263 - (i % 2) * 12}`}
                stroke="#7c9269"
                strokeWidth="4"
              />
              <circle cx={x} cy={260 - (i % 2) * 12} r="13" fill="#d08c82" />
              <circle cx={x} cy={260 - (i % 2) * 12} r="5" fill="#f0cb81" />
            </g>
          ))}
        </g>
      )}
      {gifts.includes("photo") && (
        <g data-keepsake="photo">
          <path
            d="M319 101L354 76L390 101"
            fill="none"
            stroke="#a48161"
            strokeWidth="2"
          />
          <rect x="302" y="98" width="109" height="74" rx="3" fill="#a47755" />
          <rect x="310" y="106" width="93" height="57" fill="#c4d1b4" />
          {["sui", "pako", "shiori"].map((art, i) => (
            <image
              key={art}
              href={`/images/autochess/portraits/minimal/${art}.png`}
              x={313 + i * 29}
              y="116"
              width="33"
              height="41"
            />
          ))}
        </g>
      )}
      {shown("menu-board") && (
        <g data-decoration="menu-board">
          <path
            d="M634 326L650 243L699 326"
            stroke="#a67e56"
            strokeWidth="9"
            fill="none"
          />
          <rect x="629" y="235" width="74" height="82" rx="4" fill="#98704f" />
          <rect x="636" y="242" width="60" height="68" rx="2" fill="#4c6b5b" />
          <path
            d="M649 257H682M649 265H678M649 295H683"
            stroke="#e7e4bc"
            strokeWidth="3"
          />
          <ellipse cx="667" cy="281" rx="16" ry="5" fill="#e5d0a4" />
          <path
            d="M662 274Q655 265 663 261"
            stroke="#e5d0a4"
            strokeWidth="2"
            fill="none"
          />
        </g>
      )}
      {shown("warm-lights") && (
        <g data-decoration="warm-lights">
          <path
            d="M30 78Q380 157 730 78"
            fill="none"
            stroke="#6c7d65"
            strokeWidth="3"
          />
          {[70, 148, 226, 304, 382, 460, 538, 616, 694].map((x) => {
            const y = 80 + 39 * (1 - ((x - 380) / 350) ** 2);
            return (
              <g key={x}>
                <circle cx={x} cy={y + 8} r="23" fill="#fbe1a0" opacity=".18" />
                <ellipse cx={x} cy={y + 8} rx="8" ry="11" fill="#f9d992" />
              </g>
            );
          })}
        </g>
      )}
      {shown("herb-shelf") && (
        <g data-decoration="herb-shelf">
          <rect x="471" y="154" width="163" height="10" rx="3" fill="#b3855f" />
          <path d="M485 163V185M620 163V185" stroke="#a97f5d" strokeWidth="5" />
          {[495, 548, 601].map((x) => (
            <g key={x}>
              <path
                d={`M${x - 14} 131H${x + 14}L${x + 10} 154H${x - 10}Z`}
                fill="#bc8865"
              />
              <path d={`M${x} 134V107`} stroke="#718661" strokeWidth="3" />
              <ellipse
                cx={x - 8}
                cy="117"
                rx="11"
                ry="5"
                transform={`rotate(32 ${x - 8} 117)`}
                fill="#8ca473"
              />
              <ellipse
                cx={x + 8}
                cy="110"
                rx="11"
                ry="5"
                transform={`rotate(-32 ${x + 8} 110)`}
                fill="#718d65"
              />
            </g>
          ))}
        </g>
      )}
      {gifts.includes("herbs") && !shown("herb-shelf") && (
        <g data-keepsake="herbs">
          <path
            d="M547 205L558 182M551 202L572 186M551 202L544 180"
            stroke="#748f67"
            strokeWidth="5"
          />
          <path d="M536 201H577L570 220H543Z" fill="#a78962" />
        </g>
      )}
      {gifts.includes("bowl") && (
        <g data-keepsake="bowl">
          <ellipse cx="565" cy="218" rx="21" ry="5" fill="#efd9ad" />
          <path d="M548 215Q565 242 582 215" fill="#f8e8c9" />
          <path
            d="M559 213L578 192M567 216L586 195"
            stroke="#7c7255"
            strokeWidth="3"
          />
        </g>
      )}
      {save.kindness && (
        <g data-keepsake="cat">
          <ellipse cx="168" cy="320" rx="25" ry="12" fill="#c89f70" />
          <circle cx="184" cy="308" r="13" fill="#c89f70" />
          <path
            d="M174 301L173 289L182 297M186 296L195 290L196 304"
            fill="#c89f70"
          />
          <path
            d="M177 309L182 312M188 312L192 308"
            stroke="#6d765b"
            strokeWidth="2"
          />
          <ellipse cx="215" cy="325" rx="13" ry="5" fill="#e4c17f" />
        </g>
      )}
    </svg>
  );
}

export default function HomePanel({
  save,
  onDecorate,
}: {
  save: DeliverySave;
  onDecorate: (id: string) => HomeActionResult;
}) {
  const neighbors = homeNeighbors(save);
  const [selected, setSelected] = useState(neighbors.at(-1)?.id || "");
  const [message, setMessage] = useState("");
  const neighbor = neighbors.find((v) => v.id === selected) || neighbors.at(-1);
  const gifts = homeKeepsakes(save);
  return (
    <div className={styles.home}>
      <p className={styles.subtitle}>
        {save.delivered.includes("banquet-machine")
          ? "忙了一天，明天还会在这里见面。"
          : save.delivered.length
            ? "你送出去的饭，也把街坊带到了这里。"
            : "门开着，汤温着。小馆的第一天，从这里出发。"}
      </p>
      <RestaurantIllustration save={save} />
      <div className={styles.columns}>
        <section aria-label="街坊捎来的话" className={styles.neighbors}>
          <h3>街坊捎来的话</h3>
          {neighbor ? (
            <>
              <div className={styles.faces}>
                {neighbors.map((v) => (
                  <button
                    key={v.id}
                    aria-label={`听${v.name}说话`}
                    aria-pressed={neighbor.id === v.id}
                    onClick={() => setSelected(v.id)}
                  >
                    <Image
                      src={`/images/autochess/portraits/minimal/${v.art}.png`}
                      width={43}
                      height={43}
                      alt=""
                    />
                    <span>{v.name}</span>
                  </button>
                ))}
              </div>
              <blockquote>
                <strong>{neighbor.name}</strong>
                <p>{neighbor.line}</p>
              </blockquote>
            </>
          ) : (
            <p>先给阁楼送一碗热汤吧。窗边有人等你。</p>
          )}
          {gifts.length > 0 && (
            <ul className={styles.keepsakes}>
              {gifts.map((v) => (
                <li key={v.id}>
                  <strong>{v.name}</strong>
                  <span>{v.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section aria-label="布置小馆" className={styles.shop}>
          <h3>
            布置小馆 <span>零钱 {save.money}</span>
          </h3>
          <p className={styles.shopNote}>装饰留在小馆里，按自己的喜欢摆。</p>
          {HOME_DECORATIONS.map((item) => {
            const owned = save.home.owned.includes(item.id);
            const displayed = save.home.displayed.includes(item.id);
            const unlocked = save.delivered.includes(item.order);
            const short = save.money < item.price;
            const action = owned
              ? displayed
                ? "收起"
                : "摆上"
              : `${item.price} 零钱 · 添置`;
            return (
              <div className={styles.shopRow} key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <small>
                    {!unlocked
                      ? `${item.unlock}后可添置`
                      : !owned && short
                        ? `${item.detail} 还差 ${item.price - save.money} 零钱。`
                        : item.detail}
                  </small>
                </div>
                <button
                  aria-label={`${action}${item.name}`}
                  disabled={!unlocked || (!owned && short)}
                  onClick={() => {
                    const result = onDecorate(item.id);
                    setMessage(
                      result === "bought"
                        ? `${item.name}添好了，已经摆上。`
                        : result === "stored"
                          ? `${item.name}收好了，想摆时再拿出来。`
                          : result === "placed"
                            ? `${item.name}又摆好了。`
                            : "暂时还不能添置这一件。",
                    );
                  }}
                >
                  {owned
                    ? action
                    : unlocked
                      ? `${item.price} · 添置`
                      : "等街坊来"}
                </button>
              </div>
            );
          })}
          <p className={styles.message} role="status">
            {message || "添置和摆放会自动记住。"}
          </p>
        </section>
      </div>
    </div>
  );
}
