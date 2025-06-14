docker_compose(['docker-compose.yml'])

watch_file('docker-compose.yml')

# Optional: tell Tilt what to watch and when to trigger reloads
# config.define_string('service', '', 'Name of the service to focus on')

# Watch notifier microservice files
# local_resource(
#   'notifier-reload',
#   'echo notifier source changed',
#   deps=['notifier']
# )

# sudo /home/ayra/.local/bin/tilt up --stream=true
