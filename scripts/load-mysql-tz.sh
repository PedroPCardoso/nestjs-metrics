#!/usr/bin/env bash
# Load only the IANA zones the test suite uses into MySQL's named timezone
# tables. Loading the full zoneinfo can crash mysql:8 ("Lost connection"), so a
# minimal set is loaded via a temp directory (consistent ids, no collisions).
set -euo pipefail

docker compose exec -T mysql sh -lc '
  set -e
  mkdir -p /tmp/nm-tz/America
  cp /usr/share/zoneinfo/America/New_York /usr/share/zoneinfo/America/Sao_Paulo /tmp/nm-tz/America/
  mysql_tzinfo_to_sql /tmp/nm-tz 2>/dev/null | mysql -uroot -proot mysql
'
echo "MySQL timezone tables loaded (America/New_York, America/Sao_Paulo)"
