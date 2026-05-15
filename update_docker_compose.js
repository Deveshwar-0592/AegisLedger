const fs = require('fs');
let content = fs.readFileSync('D:/AegisLedger_v4_Complete/AegisLedger/infrastructure/docker-compose.yml', 'utf8');

// 1. Network setup
content = content.replace(/networks: \[aegis\]/g, 'networks: [backend-net]');
content = content.replace(/networks:\n  aegis:\n    driver: bridge/g, 'networks:\n  frontend-net:\n    driver: bridge\n  backend-net:\n    driver: bridge');

// 2. NGINX networks
content = content.replace(/nginx:[\s\S]*?depends_on:/, 'nginx:\n    image: nginx:1.25-alpine\n    restart: unless-stopped\n    env_file: [.env]\n    networks:\n      - frontend-net\n      - backend-net\n    depends_on:');

// 3. Redis Password
content = content.replace(/command: redis-server --appendonly yes/g, 'command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-aegis_redis_pass}');
content = content.replace(/redis:\/\/redis:6379/g, 'redis://:${REDIS_PASSWORD:-aegis_redis_pass}@redis:6379');

// 4. Ports to Expose
content = content.replace(/ports: \[("[0-9:]+")\]/g, (match, p1) => {
  return 'expose: [' + p1.split(':')[0] + '"]';
});
content = content.replace(/ports: \["3007:3007","3099:3099"\]/g, 'expose: ["3007","3099"]');
content = content.replace(/ports: \["1025:1025","8025:8025"\]/g, 'expose: ["1025","8025"]');

// Nginx should keep its ports! Restore it if it was changed
content = content.replace(/nginx:[\s\S]*?expose: \["80"\,"443"\]/g, function(match) {
    return match.replace(/expose: \["80"\,"443"\]/, 'ports: ["80:80","443:443"]');
});
// Also postgres
content = content.replace(/postgres:[\s\S]*?expose: \["5432"\]/g, function(match) {
    return match.replace(/expose: \["5432"\]/, 'ports: ["5432:5432"]');
});

// 5. Database search_path
const services = ['identity', 'wallet', 'compliance', 'trade', 'fiat', 'notification', 'kyb', 'analytics', 'auth', 'billing', 'developer_portal', 'trading', 'scheduler', 'webhook', 'business_model', 'ai'];
for (const svc of services) {
  let svcName = svc.replace('_', '-');
  const regex = new RegExp('(' + svcName + ':[\\s\\S]*?DATABASE_URL: postgresql://aegis:aegis_dev_password@postgres:5432/aegisledger)', 'g');
  content = content.replace(regex, '$1?search_path=' + svc + '_svc,public');
}
content = content.replace(/(compliance-engine:[\s\S]*?DATABASE_URL: postgresql:\/\/aegis:aegis_dev_password@postgres:5432\/aegisledger)/g, '$1?search_path=compliance_svc,public');

// 6. Kafka 3 brokers
let kafka1 = `  kafka-1:
    image: confluentinc/cp-kafka:7.5.0
    restart: unless-stopped
    networks: [backend-net]
    env_file: [.env]
    depends_on: [zookeeper]
    expose: ["9092", "29092"]
    environment:
      KAFKA_BROKER_ID: 1
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-1:29092,PLAINTEXT_HOST://localhost:9092
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
      KAFKA_LOG_RETENTION_HOURS: 168
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
    volumes: [kafkadata-1:/var/lib/kafka/data]
    healthcheck:
      test: ["CMD","kafka-broker-api-versions","--bootstrap-server","localhost:9092"]
      interval: 20s

  kafka-2:
    image: confluentinc/cp-kafka:7.5.0
    restart: unless-stopped
    networks: [backend-net]
    env_file: [.env]
    depends_on: [zookeeper]
    expose: ["9093", "29093"]
    environment:
      KAFKA_BROKER_ID: 2
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-2:29093,PLAINTEXT_HOST://localhost:9093
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
      KAFKA_LOG_RETENTION_HOURS: 168
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
    volumes: [kafkadata-2:/var/lib/kafka/data]

  kafka-3:
    image: confluentinc/cp-kafka:7.5.0
    restart: unless-stopped
    networks: [backend-net]
    env_file: [.env]
    depends_on: [zookeeper]
    expose: ["9094", "29094"]
    environment:
      KAFKA_BROKER_ID: 3
      KAFKA_ZOOKEEPER_CONNECT: zookeeper:2181
      KAFKA_ADVERTISED_LISTENERS: PLAINTEXT://kafka-3:29094,PLAINTEXT_HOST://localhost:9094
      KAFKA_LISTENER_SECURITY_PROTOCOL_MAP: PLAINTEXT:PLAINTEXT,PLAINTEXT_HOST:PLAINTEXT
      KAFKA_INTER_BROKER_LISTENER_NAME: PLAINTEXT
      KAFKA_AUTO_CREATE_TOPICS_ENABLE: "true"
      KAFKA_LOG_RETENTION_HOURS: 168
      KAFKA_DEFAULT_REPLICATION_FACTOR: 3
      KAFKA_MIN_INSYNC_REPLICAS: 2
      KAFKA_OFFSETS_TOPIC_REPLICATION_FACTOR: 3
    volumes: [kafkadata-3:/var/lib/kafka/data]`;

content = content.replace(/  kafka:[\s\S]*?interval: 20s/, kafka1);
content = content.replace(/KAFKA_BROKERS: kafka:29092/g, 'KAFKA_BROKERS: kafka-1:29092,kafka-2:29093,kafka-3:29094');
content = content.replace(/depends_on: \[postgres, redis, kafka\]/g, 'depends_on: [postgres, redis, kafka-1, kafka-2, kafka-3]');

content = content.replace(/  kafkadata:/, '  kafkadata-1:\n  kafkadata-2:\n  kafkadata-3:');

fs.writeFileSync('D:/AegisLedger_v4_Complete/AegisLedger/infrastructure/docker-compose.yml', content);
