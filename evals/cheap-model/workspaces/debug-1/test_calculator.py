import calculator

assert calculator.divide(10, 2) == 5.0, "Failed division"
assert calculator.divide(10, 0) is None, "Failed zero division check"
print("ALL TESTS PASSED")
