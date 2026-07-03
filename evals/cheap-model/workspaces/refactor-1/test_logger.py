import logger
import inspect

logger_instance = logger.SimpleLogger()
assert "[INFO] test" in logger_instance.info("test")
assert "_format_message" in dir(logger.SimpleLogger), "Missing helper method"
src = inspect.getsource(logger.SimpleLogger)
assert src.count("time.strftime") == 1, "Duplicate formatting logic not consolidated"
print("ALL TESTS PASSED")
