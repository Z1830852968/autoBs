export type LogLevel = "debug" | "info" | "warn" | "error";

export type Logger = {
  debug: (data: unknown, msg?: string) => void;
  info: (data: unknown, msg?: string) => void;
  warn: (data: unknown, msg?: string) => void;
  error: (data: unknown, msg?: string) => void;
};

export type CreateLoggerOptions = {
  name: string;
  level?: LogLevel;
};

const levelOrder: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40
};

function emit(level: LogLevel, name: string, data: unknown, msg?: string) {
  const payload =
    data && typeof data === "object"
      ? { level, name, msg, ...data }
      : { level, name, msg, data };
  const line = JSON.stringify(payload);

  if (level === "error") {
    console.error(line);
    return;
  }
  if (level === "warn") {
    console.warn(line);
    return;
  }
  console.log(line);
}

export function createLogger(options: CreateLoggerOptions): Logger {
  const min = levelOrder[options.level ?? "info"];
  const name = options.name;

  return {
    debug(data, msg) {
      if (levelOrder.debug < min) return;
      emit("debug", name, data, msg);
    },
    info(data, msg) {
      if (levelOrder.info < min) return;
      emit("info", name, data, msg);
    },
    warn(data, msg) {
      if (levelOrder.warn < min) return;
      emit("warn", name, data, msg);
    },
    error(data, msg) {
      if (levelOrder.error < min) return;
      emit("error", name, data, msg);
    }
  };
}

