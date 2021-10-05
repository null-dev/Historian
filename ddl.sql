CREATE TABLE historian (
host_id SYMBOL,
profile_id SYMBOL,
visit_time TIMESTAMP,
browser_id string,
title STRING,
url STRING,
browser_typed_count LONG,
browser_visited_count LONG
) TIMESTAMP(visit_time)
  PARTITION BY MONTH;
