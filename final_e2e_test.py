import urllib.request, json, uuid

base = 'http://localhost:8080'

print('=== E2E: Field Report -> Bridge Blocking -> Route Recalculation ===')
print()

# Step 1: Health check
print('Step 1: Health check')
r = urllib.request.urlopen(base + '/health')
print(f'   {r.read().decode()}')
print()

# Step 2: Submit flood_report for synthetic bridge
print('Step 2: Submit flood_report for synthetic bridge')
client_event_id = str(uuid.uuid4())
event = {
    'clientEventId': client_event_id,
    'type': 'flood_report',
    'occurredAt': '2026-10-30T14:03:31.074723+00:00',
    'reporterId': 'volunteer-majuli-01',
    'deviceId': 'device-field-07',
    'location': {'lat': 26.8005, 'lng': 94.5005, 'accuracyM': 10},
    'note': 'Water over demo bridge deck. Depth ~0.5m above deck.',
    'photoRefs': [],
    'severity': 3,
    'depthCm': 50,
    'areaId': 'area-syn-bridge',
}
data = json.dumps({'events': [event]}).encode()
req = urllib.request.Request(base + '/api/v1/events:batch', data=data, headers={'Content-Type': 'application/json'})
r = urllib.request.urlopen(req)
acks = json.loads(r.read().decode())
print(f'   Result: {acks["acks"][0]["result"]}')
print(f'   eventId: {acks["acks"][0]["eventId"]}')
print(f'   acceptedAtVersion: {acks["acks"][0]["acceptedAtVersion"]}')
event_id = acks['acks'][0]['eventId']
print()

# Step 3: Event status
print('Step 3: Event status')
status_data = json.dumps({'clientEventIds': [client_event_id]}).encode()
req2 = urllib.request.Request(base + '/api/v1/events/status', data=status_data, headers={'Content-Type': 'application/json'})
r2 = urllib.request.urlopen(req2)
statuses = json.loads(r2.read().decode())
print(f'   {json.dumps(statuses)}')
print()

# Step 4: Projections after event
print('Step 4: Projections after event')
r3 = urllib.request.urlopen(base + '/api/v1/projections')
proj = json.loads(r3.read().decode())
print(f'   projectionVersion: {proj.get("version")}')
roads = proj.get('roads', {}).get('features', [])
blocked_roads = [rd for rd in roads if rd.get('properties', {}).get('status') == 'blocked']
print(f'   Blocked roads: {len(blocked_roads)}')
for b in blocked_roads:
    p = b['properties']
    print(f'   - {p.get("roadId")}: {p.get("name")} - {p["status"]} ({p.get("blockReason", "n/a")}) synthetic={p.get("synthetic")}')
routes = proj.get('routes', {}).get('features', [])
for rt in routes:
    p = rt['properties']
    if 'syn' in str(p.get('routeId')):
        print(f'   Route {p["routeId"]}: {p["from"]} -> {p["to"]}, status={p["status"]}, etaMin={p.get("etaMin")}, synthetic={p.get("synthetic")}, reason={p.get("reason", "n/a")}')
flood_features = proj.get('flood', {}).get('features', [])
print(f'   Flood features: {len(flood_features)}')
for f in flood_features:
    p = f['properties']
    print(f'   - {p["areaId"]}: depth={p.get("depthCm")}cm, severity={p.get("severity")}, synthetic={p.get("synthetic")}')
print()

# Step 5: Verify duplicate submission
print('Step 5: Idempotency - resubmit same event')
data2 = json.dumps({'events': [event]}).encode()
req3 = urllib.request.Request(base + '/api/v1/events:batch', data=data2, headers={'Content-Type': 'application/json'})
r4 = urllib.request.urlopen(req3)
acks2 = json.loads(r4.read().decode())
print(f'   Result: {acks2["acks"][0]["result"]}')
print(f'   eventId: {acks2["acks"][0]["eventId"]}')
print()

# Step 6: Verify audit trail
print('Step 6: Audit trail - check event in list')
r5 = urllib.request.urlopen(base + '/api/v1/events')
events_data = json.loads(r5.read().decode())
events = events_data.get('events', [])
our_event = None
for e in events:
    if e.get('event', {}).get('clientEventId') == client_event_id:
        our_event = e
        break
if our_event:
    print(f'   Found event: type={our_event["event"]["type"]}')
    print(f'   clientEventId={our_event["event"]["clientEventId"]}')
    print(f'   serverState={our_event["serverState"]}')
    print(f'   receivedAt={our_event.get("receivedAt")}')
    print(f'   appliedAtVersion={our_event.get("appliedAtVersion")}')
else:
    print('   Event not found! Total events: {len(events)}')
print()

print('=== E2E TEST COMPLETE ===')
