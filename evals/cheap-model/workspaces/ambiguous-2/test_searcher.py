import searcher
import time

assert searcher.contains_duplicates([1, 2, 3, 1])
assert not searcher.contains_duplicates([1, 2, 3])
t0 = time.time()
searcher.contains_duplicates(list(range(5000)))
t1 = time.time()
assert (t1 - t0) < 0.1, "Optimization failed, execution took too long"
print("ALL TESTS PASSED")
