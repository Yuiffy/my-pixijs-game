import type { Equipment } from './equipment';
import { ARMORS, TALISMANS } from './equipment';
import { WEAPONS } from './weapons';
import type { GameState } from './types';
import styles from './nightRain.module.css';

type EquipmentId = GameState['weapon'] | Equipment['armor'] | Equipment['talisman'];
const NAMES = { ...WEAPONS, ...ARMORS, ...TALISMANS };

/** Code-native portraits keep every item distinct without downloads or decoding. */
export default function EquipmentPortrait({ id }: { id: EquipmentId }) {
  let art;
  switch (id) {
    case 'umbrella':
      art = <><path d="M20 63Q38 21 75 28L91 36 20 63Z" fill="#b49d75" /><path d="M20 63 57 31 43 54M57 31 73 43M57 31 91 36" stroke="#efdab1" /><path d="m57 31 25 62q5 12-6 14" stroke="#c9b798" strokeWidth="4" /><path d="m24 67 4-8m8 4 4-9m8 4 4-9m8 3 4-9m9 3 3-8m10 1 2-6" stroke="#695b49" /></>;
      break;
    case 'ironUmbrella':
      art = <><path d="M24 92 52 26 68 18 76 33 43 99Z" fill="#638e94" /><path d="m52 26 24 7m-32 9 25 6m-32 9 24 5M31 73l24 6M25 88l24 6" stroke="#bde6e2" strokeWidth="3" /><path d="M68 18 31 107" stroke="#dce6d4" strokeWidth="4" /><path d="m31 99-5 12q-2 7 5 6l5-2" stroke="#bda36b" strokeWidth="5" /><path d="m65 21 6-12" stroke="#d4d5bf" strokeWidth="3" /></>;
      break;
    case 'katana':
      art = <><path d="M34 97Q55 62 88 13L86 31Q61 68 40 100Z" fill="#d9eff0" /><path d="M37 96Q57 62 87 17" stroke="#759da9" /><path d="m28 92 20 12" stroke="#d7b572" strokeWidth="5" /><path d="m34 101-11 19" stroke="#bcc2bb" strokeWidth="8" /><path d="m23 120 11-19m-9 13 6 4m-2-12 6 4" stroke="#405d68" strokeWidth="3" /><path d="m71 65-24 51" stroke="#6b8184" strokeWidth="8" /><path d="m68 72 7 3M48 111l6 3" stroke="#caa971" strokeWidth="3" /></>;
      break;
    case 'graveSpear':
      art = <><path d="M27 118 72 32" stroke="#78675d" strokeWidth="5" /><path d="m72 32-8-2 24-23-3 33-9-4Z" fill="#c5b9df" /><path d="m88 7-14 27" stroke="#f0e1ff" /><path d="m65 45 16-12" stroke="#b89968" strokeWidth="4" /><path d="M70 43q-19 6-15 22l10-10 4 8" fill="#817296" /><path d="m30 108 5 3m-3-10 6 3" stroke="#c3aa7b" strokeWidth="3" /></>;
      break;
    case 'reedDaggers':
      art = <><path d="M28 94 37 69 51 17 60 40 43 75 34 98Z" fill="#b8dbce" /><path d="M37 69 51 23" stroke="#4a8c79" strokeWidth="2" /><path d="m23 91 17 5" stroke="#d8b77d" strokeWidth="4" /><path d="m29 97-5 20" stroke="#587e6b" strokeWidth="8" /><path d="M67 89 76 65 91 18 96 44 83 69 74 92Z" fill="#a2cdbc" /><path d="M77 65 91 23" stroke="#4a8c79" strokeWidth="2" /><path d="m62 86 18 6" stroke="#d8b77d" strokeWidth="4" /><path d="m68 93-5 20" stroke="#587e6b" strokeWidth="8" /><path d="m21 119 7-2m32-2 7-2" stroke="#d4c794" strokeWidth="3" /></>;
      break;
    case 'stoneMaul':
      art = <><path d="m37 116 24-66" stroke="#8f785b" strokeWidth="8" /><path d="m25 35 17-20 46 13 8 24-18 19-47-13Z" fill="#879486" /><path d="m25 35 44 13 27 4M69 48l9 23M42 15l-1 19 12 6-3 9" stroke="#c1c4a2" strokeWidth="2" /><path d="m59 20-11 42m26-38-12 42" stroke="#635f51" strokeWidth="5" /><path d="m32 111 11 4m-8-13 11 4" stroke="#c7b885" strokeWidth="3" /></>;
      break;
    case 'traveler':
      art = <><path d="m38 29-17 8-12 35 18 8 13-25-6 56 54 0-6-56 13 25 17-8-12-35-17-8-12 12Z" fill="#a6b6b1" /><path d="m38 29 21 28 24-28-8-9H46Z" fill="#dae0d3" /><path d="m59 57-4 48m-20-27 50 0" stroke="#556d6a" strokeWidth="4" /><path d="m37 111 2-17m43 17-2-17" stroke="#d9d6bd" strokeWidth="3" /><path d="m24 39-9 30m82-30 9 30" stroke="#738a83" strokeWidth="2" /></>;
      break;
    case 'ossuaryMail':
      art = <><path d="m36 29-18 11-5 23 21 7 6 40 44 0 6-40 20-7-5-23-18-11-12 13H49Z" fill="#7e8393" /><path d="M37 31 49 47h26l11-16-5 31-19 11-20-11Z" fill="#c2c0bd" /><path d="m41 78 42 0m-41 9 40 0m-39 9 38 0" stroke="#d6cbb5" strokeWidth="5" /><path d="M19 44 36 51M88 51l17-7M27 56l7 3m54 0 8-3" stroke="#c4b9ad" strokeWidth="4" /><path d="m47 42 15 15 13-15m-13 15 0 12" stroke="#756879" strokeWidth="2" /><circle cx="62" cy="78" r="4" fill="#bfa776" /></>;
      break;
    case 'reedCape':
      art = <><path d="M44 24q18-10 34 0l-2 26 26 60-21-9-8 16-13-12-16 10-8-14-19 8 28-59Z" fill="#568776" /><path d="M44 24q17 13 34 0l-4 22-14 9-15-9Z" fill="#a6c7ae" /><path d="M51 55 35 101m24-43-1 43m10-47 15 48" stroke="#8fb198" strokeWidth="3" /><path d="m46 30 29 0m-25 4 18 10" stroke="#d1d4ae" strokeWidth="2" /><circle cx="61" cy="51" r="4" fill="#dec891" /></>;
      break;
    case 'goldBell':
      art = <><path d="M37 24Q58 5 82 24L66 49" fill="none" stroke="#817d66" strokeWidth="4" /><path d="m52 46 17 0 3 13q-1 19 10 27H39q11-9 10-27Z" fill="#cbab65" /><path d="m52 47 17 0m-26 34 35 0" stroke="#f7d99b" strokeWidth="3" /><ellipse cx="61" cy="87" rx="24" ry="5" fill="#776245" /><path d="M61 86v13" stroke="#e4c983" strokeWidth="3" /><circle cx="61" cy="101" r="5" fill="#d7b66f" /><path d="m58 58-5 18" stroke="#edcf8f" strokeWidth="4" /></>;
      break;
    case 'graveSeal':
      art = <><path d="M36 27Q60 5 85 29L64 48" fill="none" stroke="#b69b7b" strokeWidth="3" /><path d="m38 43 43-2 7 15-5 51-43 4-6-17Z" fill="#95918e" /><path d="m38 43 9 11 41 2m-41-2-4 54" stroke="#c7bcb0" strokeWidth="2" /><path d="m54 67 20 0m-15 0-1 10-8 7m8-7 16 0m-9 0 0 15m-9 2 19 0" fill="none" stroke="#524d5b" strokeWidth="3" /><circle cx="63" cy="51" r="3" fill="#534f52" /><path d="m78 100-9 6" stroke="#736b75" /></>;
      break;
    case 'tideKnot':
      art = <><path d="M38 28Q65 3 84 27L69 47" fill="none" stroke="#6faeb2" strokeWidth="4" /><path d="M59 43q-22 0-22 15 0 18 35 18 17 0 17-13 0-17-36-7-24 6-9 20 19 18 32-12 9-21-17-21Z" fill="none" stroke="#aacbc0" strokeWidth="8" /><path d="M59 43q-22 0-22 15 0 18 35 18 17 0 17-13" fill="none" stroke="#648f92" strokeWidth="2" /><path d="m53 79-11 26m27-27 10 26" stroke="#85b1aa" strokeWidth="5" /><path d="m39 108 8 3m28-5 8 2" stroke="#d5c48e" strokeWidth="6" /></>;
      break;
    default:
      art = <><circle cx="60" cy="64" r="26" stroke="#658080" strokeDasharray="4 6" fill="none" /><path d="M48 64h24" stroke="#8b9b8f" strokeWidth="2" /></>;
  }
  return <svg className={styles.equipmentPortrait} viewBox="0 0 120 132" role="img" aria-label={`${NAMES[id].name}造型`} data-equipment-art={id}><rect x="1" y="1" width="118" height="130" rx="9" fill="#172d33" stroke="#9d8a6355" /><path d="M12 108Q59 99 108 108" stroke="#b6a47522" fill="none" /><g strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5">{art}</g></svg>;
}
