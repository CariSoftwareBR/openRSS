export APP_OPENRSS_PORT="8285"

local_ips=$(hostname --all-ip-addresses 2> /dev/null) || local_ips=""

# http:// origins with the app_proxy port, so sign-in also works when the app is opened by IP.
ips_with_port=$(for ip in $local_ips; do
  if [[ "$ip" == *:* ]]; then
    echo -n "http://[$ip]:$APP_OPENRSS_PORT,"
  else
    echo -n "http://$ip:$APP_OPENRSS_PORT,"
  fi
done | sed 's/,$//')

export APP_OPENRSS_LOCAL_URLS="${ips_with_port}"
