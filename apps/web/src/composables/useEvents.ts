import { onBeforeUnmount, ref } from "vue";

export function useTaskEvents(taskId: string) {
  const connected = ref(false);
  const lastEvent = ref("");
  const error = ref("");

  const url = taskId ? `/api/events?taskId=${encodeURIComponent(taskId)}` : "/api/events";
  const es = new EventSource(url);

  es.onopen = () => {
    connected.value = true;
    error.value = "";
  };

  es.onerror = () => {
    connected.value = false;
    error.value = "disconnected";
  };

  es.addEventListener("snapshot", (ev) => {
    lastEvent.value = (ev as MessageEvent).data;
  });

  onBeforeUnmount(() => {
    es.close();
  });

  return { connected, lastEvent, error };
}

