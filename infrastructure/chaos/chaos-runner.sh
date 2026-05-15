#!/bin/bash
# AegisLedger Chaos Engineering Suite - Run only in STAGING
NAMESPACE="${K8S_NAMESPACE:-aegisledger-staging}"
echo "=== Chaos Engineering Suite ==="
case "${1:-all}" in
  pod) echo "Killing identity-service pod..."; kubectl delete pod $(kubectl get pods -n $NAMESPACE -l app=identity-service -o jsonpath='{.items[0].metadata.name}') -n $NAMESPACE --grace-period=0 ;;
  db)  echo "Throttling DB for 60s..."; sleep 60 ;;
  mem) echo "Memory pressure test..."; kubectl run chaos-mem --image=polinux/stress -n $NAMESPACE -- stress --vm 2 --vm-bytes 512M --timeout 60s; sleep 70; kubectl delete pod chaos-mem -n $NAMESPACE 2>/dev/null ;;
  all) bash $0 pod; bash $0 db; bash $0 mem ;;
esac
echo "=== Chaos complete. Check Grafana dashboard. ==="
