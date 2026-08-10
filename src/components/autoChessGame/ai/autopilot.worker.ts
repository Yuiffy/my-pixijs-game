import { AutopilotWorkerRuntime } from "./autopilotWorkerRuntime";
import type {
  AutopilotWorkerRequest,
  AutopilotWorkerResponse,
} from "./autopilotWorkerProtocol";

const runtime = new AutopilotWorkerRuntime();

globalThis.onmessage = (event: MessageEvent<AutopilotWorkerRequest>) => {
  const response: AutopilotWorkerResponse = event.data.type === "prewarm"
    ? runtime.prewarm(event.data)
    : runtime.decide(event.data);
  globalThis.postMessage(response);
};
