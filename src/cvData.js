// ─────────────────────────────────────────────────────────────────────────
//  YOUR CV LIVES HERE.  Edit freely — no 3D knowledge required.
//
//  • profile   → name / role / intro shown top-left
//  • stations  → the landmarks on the planet. Each becomes a sign you can
//                drive to. Reorder / add / remove them as you like.
//
//  Position on the globe is given in degrees:
//     lat:  -90 (south pole) … +90 (north pole)
//     lon:    0 … 360  (around the equator)
//  Spread them out so there's something to discover as you drive.
// ─────────────────────────────────────────────────────────────────────────

export const profile = {
  name: 'Peter Cross',
  role: 'Java Engineer · Event-Driven Microservices',
  tagline: 'Drive around to explore my work →',
};

export const stations = [
  {
    id: 'about',
    title: 'About',
    color: '#FF6F59', // coral
    lat: 22,
    lon: 0,
    items: [
      { head: 'Backend Java engineer', sub: 'Event-driven microservices · Liverpool, UK' },
      { head: '10M parcels / week at peak', sub: 'Spring Boot · Kafka · MongoDB under prod load' },
      { head: 'Java modernisation & on-call lead', sub: 'Stabilising services, leading incident response' },
      { head: 'Building AI developer tooling', sub: 'Claude skills with multi-team adoption' },
      { head: 'BSc (Hons) Computer Science, 2:1', sub: 'University of Essex · 2020' },
    ],
  },
  {
    id: 'experience',
    title: 'Experience',
    color: '#3D7DCA', // blue
    lat: -8,
    lon: 60,
    items: [
      { head: 'Java Developer · InPost', sub: 'Apr 2025 – Present (via Yodel acquisition)' },
      { head: 'Java Developer · Yodel', sub: 'Mar 2022 – Apr 2025 · promoted from Junior' },
      { head: 'Junior Java Developer · Yodel', sub: 'Apr 2021 – Mar 2022' },
    ],
  },
  {
    id: 'inpost',
    title: 'InPost',
    color: '#E0A93B', // amber
    lat: 44,
    lon: 116,
    items: [
      { head: 'Feature toggle system, end-to-end', sub: 'Design doc, Spring Boot 2→3, CRUD API + React admin' },
      { head: 'Rewrote slow Mongo aggregations', sub: 'Native operators on core read paths flagged in Kibana' },
      { head: 'Java 11 → 21 modernisation', sub: 'Records, pattern matching, var — unblocked libraries' },
      { head: 'O365 tenant migration (product side)', sub: 'Impact analysis & mitigations, zero downtime' },
    ],
  },
  {
    id: 'ai-tooling',
    title: 'AI Tooling',
    color: '#2FA37C', // green
    lat: 6,
    lon: 168,
    items: [
      { head: 'Release Planner', sub: 'CLI: Azure DevOps + Jenkins delta, Claude reconciles, HTML report — 3 teams' },
      { head: 'Test Writer', sub: 'Claude skill: JUnit, integration, Cucumber, Pact — 100% coverage' },
      { head: 'Architecture Docs (CIAO)', sub: 'Ingests a codebase → diagrams + queryable KB, run on 5 services' },
      { head: 'Company-wide AI brownbags', sub: 'Sharing tooling & adoption patterns' },
    ],
  },
  {
    id: 'yodel',
    title: 'Yodel',
    color: '#9B6BD1', // violet
    lat: -34,
    lon: 214,
    items: [
      { head: '~100 services · 170 Kafka topics', sub: '15 MongoDB DBs across ~85 collections' },
      { head: 'Scaled parcel processing for peak', sub: 'Fewer round-trips, batched writes, hot-path caching' },
      { head: 'Kafka Streams enrichment', sub: 'Real-time parcel events · Connect source/sink pipelines' },
      { head: 'On-call: led RCA & incidents', sub: 'Triaged production incidents, drove root-cause fixes' },
    ],
  },
  {
    id: 'skills',
    title: 'Skills',
    color: '#E5547F', // pink
    lat: 30,
    lon: 268,
    items: [
      { head: 'Java 8–21 · Spring Boot', sub: 'Spring Data MongoDB, Security, REST, OpenAPI' },
      { head: 'Apache Kafka', sub: 'Streams, Connect, Schema Registry, DLQs, offsets' },
      { head: 'MongoDB · Caffeine', sub: 'Schema & index design, Aggregation, Change Streams' },
      { head: 'Testing & CI/CD', sub: 'JUnit5, Testcontainers, Pact · Jenkins, Docker, K8s' },
      { head: 'Observability', sub: 'Prometheus, Grafana, ELK, Nagios · RCA' },
    ],
  },
  {
    id: 'contact',
    title: 'Contact',
    color: '#5BB6C9', // teal
    lat: 58,
    lon: 320,
    items: [
      { head: 'p.cross@hotmail.co.uk', sub: 'Liverpool, UK' },
      { head: 'linkedin.com/in/peterjosephcross', sub: '' },
      { head: 'github.com/glass-uk', sub: '' },
    ],
  },
];
