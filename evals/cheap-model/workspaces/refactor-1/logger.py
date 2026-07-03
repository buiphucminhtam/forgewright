import time


class SimpleLogger:
    def info(self, msg):
        t = time.strftime("%Y-%m-%d %H:%M:%S")
        return f"[{t}] [INFO] {msg}"

    def warn(self, msg):
        t = time.strftime("%Y-%m-%d %H:%M:%S")
        return f"[{t}] [WARN] {msg}"

    def error(self, msg):
        t = time.strftime("%Y-%m-%d %H:%M:%S")
        return f"[{t}] [ERROR] {msg}"
