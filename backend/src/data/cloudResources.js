// ==============================================================================
// InfraPulse - Canonical Cloud Resources Inventory Baseline Data
// Phase 23C: Cloud Resource Lifecycle & Cost Governance
// ==============================================================================

export const INITIAL_CLOUD_RESOURCES = [
  // 1. AWS Cloud Resources (ap-south-1 Mumbai)
  {
    id: 'res-aws-ec2-staging',
    name: 'infrapulse-staging-ec2',
    provider: 'aws',
    resource_type: 'ec2_instance',
    region: 'ap-south-1',
    environment: 'staging',
    current_state: 'running',
    estimated_hourly_cost: 0.0251,
    cost_breakdown: {
      compute: 0.0168,      // t4g.small On-Demand in ap-south-1
      storage: 0.0033,      // 30 GB gp3 ($0.08/GB-month / 730h)
      ipv4: 0.0050,         // In-use public IPv4 address ($0.005/hr)
      networking: 0.0000,
      managed: 0.0000
    },
    dependencies: [],
    persistence_requirements: {
      volume_type: 'ebs_gp3',
      volume_size_gb: 30,
      delete_on_termination: false,
      snapshot_policy: 'daily'
    },
    is_critical_dependency: false,
    metadata: {
      instance_id: 'i-0a1b2c3d4e5f67890',
      instance_type: 't4g.small',
      availability_zone: 'ap-south-1a',
      public_ip: '13.232.100.45',
      private_ip: '172.31.16.20',
      is_simulated: true
    },
    last_lifecycle_operation: 'inspect',
    last_health_check_status: 'healthy'
  },
  {
    id: 'res-aws-rds-postgres',
    name: 'infrapulse-staging-rds-pg16',
    provider: 'aws',
    resource_type: 'rds_instance',
    region: 'ap-south-1',
    environment: 'staging',
    current_state: 'running',
    estimated_hourly_cost: 0.0290,
    cost_breakdown: {
      compute: 0.0180,      // db.t4g.micro Multi-AZ / Single-AZ
      storage: 0.0030,      // 20 GB gp3
      ipv4: 0.0000,
      networking: 0.0000,
      managed: 0.0080       // Managed backup & maintenance
    },
    dependencies: [],
    persistence_requirements: {
      storage_type: 'aurora_or_rds_ebs',
      multi_az: false,
      automated_backups: true,
      deletion_protection: true
    },
    is_critical_dependency: true, // Critical database dependency
    metadata: {
      db_instance_identifier: 'rds-infrapulse-staging',
      engine: 'postgres',
      engine_version: '16.2',
      allocated_storage_gb: 20,
      is_simulated: true
    },
    last_lifecycle_operation: 'inspect',
    last_health_check_status: 'healthy'
  },

  // 2. Local Docker Compose Workloads
  {
    id: 'res-docker-postgres',
    name: 'infrapulse-postgres',
    provider: 'docker',
    resource_type: 'docker_compose_service',
    region: 'local',
    environment: 'local',
    current_state: 'running',
    estimated_hourly_cost: 0.0000,
    cost_breakdown: { compute: 0.0, storage: 0.0, ipv4: 0.0, networking: 0.0, managed: 0.0 },
    dependencies: [],
    persistence_requirements: {
      has_persistent_volume: true,
      volume_name: 'pgdata',
      mount_path: '/var/lib/postgresql/data'
    },
    is_critical_dependency: true,
    metadata: {
      image: 'postgres:16-alpine',
      container_name: 'infrapulse-postgres',
      port_mapping: '5432:5432',
      is_simulated: true
    },
    last_lifecycle_operation: 'inspect',
    last_health_check_status: 'healthy'
  },
  {
    id: 'res-docker-backend',
    name: 'infrapulse-backend',
    provider: 'docker',
    resource_type: 'docker_compose_service',
    region: 'local',
    environment: 'local',
    current_state: 'running',
    estimated_hourly_cost: 0.0000,
    cost_breakdown: { compute: 0.0, storage: 0.0, ipv4: 0.0, networking: 0.0, managed: 0.0 },
    dependencies: ['res-docker-postgres'],
    persistence_requirements: { has_persistent_volume: false },
    is_critical_dependency: false,
    metadata: {
      image: 'infrapulse-backend:staging',
      container_name: 'infrapulse-backend',
      port_mapping: '5000:5000',
      is_simulated: true
    },
    last_lifecycle_operation: 'inspect',
    last_health_check_status: 'healthy'
  },
  {
    id: 'res-docker-worker',
    name: 'infrapulse-worker',
    provider: 'docker',
    resource_type: 'docker_compose_service',
    region: 'local',
    environment: 'local',
    current_state: 'running',
    estimated_hourly_cost: 0.0000,
    cost_breakdown: { compute: 0.0, storage: 0.0, ipv4: 0.0, networking: 0.0, managed: 0.0 },
    dependencies: ['res-docker-postgres', 'res-docker-backend'],
    persistence_requirements: { has_persistent_volume: false },
    is_critical_dependency: false,
    metadata: {
      image: 'infrapulse-backend:staging',
      container_name: 'infrapulse-worker',
      command: 'node src/worker.js',
      is_simulated: true
    },
    last_lifecycle_operation: 'inspect',
    last_health_check_status: 'healthy'
  },
  {
    id: 'res-docker-frontend',
    name: 'infrapulse-frontend',
    provider: 'docker',
    resource_type: 'docker_compose_service',
    region: 'local',
    environment: 'local',
    current_state: 'running',
    estimated_hourly_cost: 0.0000,
    cost_breakdown: { compute: 0.0, storage: 0.0, ipv4: 0.0, networking: 0.0, managed: 0.0 },
    dependencies: ['res-docker-backend'],
    persistence_requirements: { has_persistent_volume: false },
    is_critical_dependency: false,
    metadata: {
      image: 'infrapulse-frontend:staging',
      container_name: 'infrapulse-frontend',
      port_mapping: '8080:8080',
      is_simulated: true
    },
    last_lifecycle_operation: 'inspect',
    last_health_check_status: 'healthy'
  },

  // 3. Kubernetes Cluster Workloads (Local K3s / Cloud EKS)
  {
    id: 'res-k8s-sts-postgres',
    name: 'postgres-statefulset',
    provider: 'kubernetes',
    resource_type: 'k8s_statefulset',
    region: 'ap-south-1',
    environment: 'staging',
    current_state: 'running',
    estimated_hourly_cost: 0.0120,
    cost_breakdown: { compute: 0.0080, storage: 0.0040, ipv4: 0.0, networking: 0.0, managed: 0.0 },
    dependencies: [],
    persistence_requirements: {
      has_pvc: true,
      claim_name: 'pgdata-postgres-0',
      storage_class: 'gp3',
      storage_size: '5Gi'
    },
    is_critical_dependency: true,
    metadata: {
      namespace: 'infrapulse',
      replicas: 1,
      selector: 'app.kubernetes.io/component=database',
      is_simulated: true
    },
    last_lifecycle_operation: 'inspect',
    last_health_check_status: 'healthy'
  },
  {
    id: 'res-k8s-dep-backend',
    name: 'backend-deployment',
    provider: 'kubernetes',
    resource_type: 'k8s_deployment',
    region: 'ap-south-1',
    environment: 'staging',
    current_state: 'running',
    estimated_hourly_cost: 0.0160,
    cost_breakdown: { compute: 0.0160, storage: 0.0, ipv4: 0.0, networking: 0.0, managed: 0.0 },
    dependencies: ['res-k8s-sts-postgres'],
    persistence_requirements: { has_pvc: false },
    is_critical_dependency: false,
    metadata: {
      namespace: 'infrapulse',
      replicas: 2,
      selector: 'app.kubernetes.io/component=backend',
      is_simulated: true
    },
    last_lifecycle_operation: 'inspect',
    last_health_check_status: 'healthy'
  },
  {
    id: 'res-k8s-dep-frontend',
    name: 'frontend-deployment',
    provider: 'kubernetes',
    resource_type: 'k8s_deployment',
    region: 'ap-south-1',
    environment: 'staging',
    current_state: 'running',
    estimated_hourly_cost: 0.0080,
    cost_breakdown: { compute: 0.0080, storage: 0.0, ipv4: 0.0, networking: 0.0, managed: 0.0 },
    dependencies: ['res-k8s-dep-backend'],
    persistence_requirements: { has_pvc: false },
    is_critical_dependency: false,
    metadata: {
      namespace: 'infrapulse',
      replicas: 2,
      selector: 'app.kubernetes.io/component=frontend',
      is_simulated: true
    },
    last_lifecycle_operation: 'inspect',
    last_health_check_status: 'healthy'
  }
];

export const INITIAL_CLOUD_SCHEDULES = [
  {
    id: 'sched-ec2-overnight-stop',
    resource_id: 'res-aws-ec2-staging',
    name: 'Overnight Staging Compute Shutdown',
    action: 'stop',
    cron_expression: '0 20 * * 1-5', // 8:00 PM IST Mon-Fri
    timezone: 'Asia/Kolkata',
    enabled: true,
    is_paused: false,
    days_of_week: [1, 2, 3, 4, 5],
    time_of_day: '20:00',
    missed_execution_recovery: true,
    created_by: 'admin@infrapulse.io'
  },
  {
    id: 'sched-ec2-morning-start',
    resource_id: 'res-aws-ec2-staging',
    name: 'Morning Staging Compute Resume',
    action: 'start',
    cron_expression: '0 8 * * 1-5', // 8:00 AM IST Mon-Fri
    timezone: 'Asia/Kolkata',
    enabled: true,
    is_paused: false,
    days_of_week: [1, 2, 3, 4, 5],
    time_of_day: '08:00',
    missed_execution_recovery: true,
    created_by: 'admin@infrapulse.io'
  }
];

