# Exact subprocess commands

Generated from commands.jsonl. Working directories and arguments are preserved; environment overrides are defined in tests/runtime-validation/independent23m.mjs. SQL and browser operations are recorded by the corresponding harness sources and JSON evidence.

1. 2026-10-31T15:51:43.859Z; cwd: D:\Projects\InfraPulse

    `& 'git' 'status' '--short'`

2. 2026-10-31T15:51:45.685Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'backend/src/db/migrate.js'`

3. 2026-10-31T15:51:47.878Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'backend/src/db/seed.js'`

4. 2026-10-31T15:51:48.766Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'backend/src/db/migrate.js'`

5. 2026-10-31T15:51:50.891Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'backend/src/db/seed.js'`

6. 2026-10-31T15:51:59.897Z; cwd: D:\Projects\InfraPulse\frontend

    `& 'C:\Program Files\nodejs\node.exe' 'node_modules/vite/bin/vite.js' 'build'`

7. 2026-10-31T15:52:23.824Z; cwd: D:\Projects\InfraPulse\backend

    `& 'C:\Program Files\nodejs\node.exe' 'src/server.js'`

8. 2026-10-31T15:52:23.837Z; cwd: D:\Projects\InfraPulse\backend

    `& 'C:\Program Files\nodejs\node.exe' 'src/server.js'`

9. 2026-10-31T15:52:23.853Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'tests/runtime-validation/independent-serve23m.mjs'`

10. 2026-10-31T15:53:57.653Z; cwd: D:\Projects\InfraPulse

    `& 'C:/Program Files/PostgreSQL/16/bin/initdb.exe' '-D' 'D:/Projects/.infrapulse-23m-independent/pgdata' '-U' 'postgres' '-A' 'trust' '--encoding=UTF8' '--no-locale'`

11. 2026-10-31T15:54:16.331Z; cwd: D:\Projects\InfraPulse

    `& 'C:/Program Files/PostgreSQL/16/bin/pg_ctl.exe' '-D' 'D:/Projects/.infrapulse-23m-independent/pgdata' '-l' 'D:/Projects/.infrapulse-23m-independent/postgres.log' '-o' '-p 5541 -h 127.0.0.1 -c shared_buffers=16MB -c max_connections=20 -c autovacuum=off' '-w' 'start'`

12. 2026-10-31T15:55:03.418Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'backend/src/db/migrate.js'`

13. 2026-10-31T15:55:05.681Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'backend/src/db/seed.js'`

14. 2026-10-31T15:55:06.545Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'backend/src/db/migrate.js'`

15. 2026-10-31T15:55:08.741Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'backend/src/db/seed.js'`

16. 2026-10-31T15:55:28.217Z; cwd: D:\Projects\InfraPulse\backend

    `& 'C:\Program Files\nodejs\node.exe' 'src/server.js'`

17. 2026-10-31T15:55:28.228Z; cwd: D:\Projects\InfraPulse\backend

    `& 'C:\Program Files\nodejs\node.exe' 'src/server.js'`

18. 2026-10-31T15:55:28.240Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'tests/runtime-validation/independent-serve23m.mjs'`

19. 2026-10-31T15:57:14.827Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' '--test-concurrency=1' 'backend/src/engine/__tests__/*.test.js' 'backend/src/services/__tests__/*.test.js' 'backend/src/integrations/telemetry/__tests__/*.test.js' 'backend/src/db/__tests__/*.test.js'`

20. 2026-10-31T15:57:28.480Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/reliability/reliability.test.js'`

21. 2026-10-31T15:57:30.236Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/rca-evaluation/rcaEngineEnhancement.test.js'`

22. 2026-10-31T15:57:30.946Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/rca-evaluation/aiAssistant.test.js'`

23. 2026-10-31T15:57:32.357Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/remediation/runbookOrchestration.test.js'`

24. 2026-10-31T15:57:38.802Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/slo/sloReliability.test.js'`

25. 2026-10-31T15:57:39.607Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/changes/changeIntelligence.test.js'`

26. 2026-10-31T15:57:40.491Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/correlation/unifiedCorrelation.test.js'`

27. 2026-10-31T15:57:41.223Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/operations/operationalIntelligence.test.js'`

28. 2026-10-31T15:57:42.072Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/integrations/enterpriseIntegrations.test.js'`

29. 2026-10-31T15:57:43.718Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/release/fullLifecycleE2E.test.js'`

30. 2026-10-31T15:57:50.572Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/release/failureRecovery.test.js'`

31. 2026-10-31T15:57:52.860Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/cloud-lifecycle/cloudLifecycle.test.js'`

32. 2026-10-31T15:57:55.202Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/cloud-lifecycle/awsReadOnlyDiscovery.test.js'`

33. 2026-10-31T15:57:57.411Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/cloud-lifecycle/driftDetectionReconciliation.test.js'`

34. 2026-10-31T15:57:59.052Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/cloud-lifecycle/realInfrastructureIntegrations.test.js'`

35. 2026-10-31T15:58:00.991Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/cloud-lifecycle/liveObservabilityIncidentIntelligence.test.js'`

36. 2026-10-31T15:58:02.864Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/cloud-lifecycle/liveIntegrationAcceptance.test.js'`

37. 2026-10-31T15:58:03.842Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/cloud-lifecycle/autonomousSreIntelligence.test.js'`

38. 2026-10-31T15:58:04.857Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/cloud-lifecycle/enterpriseProductionHardening.test.js'`

39. 2026-10-31T15:58:06.241Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' '--test-skip-pattern=11\. Idempotency|12\. Concurrency Lock' 'tests/cloud-lifecycle/governedRemediationIntelligence.test.js'`

40. 2026-10-31T15:58:07.676Z; cwd: D:\Projects\InfraPulse\reports\phase23m\independent

    `& 'C:\Program Files\nodejs\node.exe' 'tests/rca-evaluation/evaluationRunner.js'`

41. 2026-10-31T15:59:33.830Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'tests/runtime-validation/independent-dedup-child23m.mjs'`

42. 2026-10-31T15:59:34.435Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'tests/runtime-validation/independent-dedup-child23m.mjs'`

43. 2026-10-31T15:59:38.232Z; cwd: D:\Projects\InfraPulse

    `& 'C:/Program Files/PostgreSQL/16/bin/pg_dump.exe' '-h' '127.0.0.1' '-p' '5541' '-U' 'postgres' '-d' 'infrapulse_23m_independent_1793461903978' '-F' 'c' '-f' 'D:\Projects\InfraPulse\reports\phase23m\independent\isolated-backup.dump'`

44. 2026-10-31T15:59:39.205Z; cwd: D:\Projects\InfraPulse

    `& 'C:/Program Files/PostgreSQL/16/bin/pg_restore.exe' '-h' '127.0.0.1' '-p' '5541' '-U' 'postgres' '-d' 'infrapulse_23m_independent_1793461903978_restore' '--exit-on-error' 'D:\Projects\InfraPulse\reports\phase23m\independent\isolated-backup.dump'`

45. 2026-10-31T15:59:43.149Z; cwd: D:\Projects\InfraPulse\reports\phase23m\independent

    `& 'C:\Program Files\nodejs\node.exe' 'D:\Projects\InfraPulse\tests\rca-evaluation\evaluationRunner.js'`

46. 2026-10-31T16:02:14.202Z; cwd: D:\Projects\InfraPulse

    `& 'git' 'status' '--short'`

47. 2026-10-31T16:03:23.751Z; cwd: D:\Projects\InfraPulse

    `& 'powershell.exe' '-NoProfile' '-File' 'scripts/backup-db.ps1' '-BackupDir' 'D:\Projects\InfraPulse\reports\phase23m\independent\script-backup' '-DbName' 'infrapulse_23m_independent_1793461903978' '-DbHost' '127.0.0.1' '-DbPort' '5541' '-DbUser' 'postgres'`

48. 2026-10-31T16:03:25.210Z; cwd: D:\Projects\InfraPulse

    `& 'powershell.exe' '-NoProfile' '-File' 'scripts/restore-db.ps1' '-BackupFile' 'D:\Projects\InfraPulse\reports\phase23m\independent\script-backup\infrapulse_backup_20261031_213324.sql' '-DbName' 'infrapulse_23m_independent_1793461903978_restore' '-DbHost' '127.0.0.1' '-DbPort' '5541' '-DbUser' 'postgres'`

49. 2026-10-31T16:03:29.874Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' 'D:\Projects\InfraPulse\tests\performance\api-load.js'`

50. 2026-10-31T16:04:31.934Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/runtime-validation/capacityZeroUtilization23m.test.mjs'`

51. 2026-10-31T16:04:37.793Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/runtime-validation/capacityZeroUtilization23m.test.mjs'`

52. 2026-10-31T16:04:43.654Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/runtime-validation/capacityZeroUtilization23m.test.mjs'`

53. 2026-10-31T16:05:18.823Z; cwd: D:\Projects\InfraPulse

    `& 'C:/Program Files/PostgreSQL/16/bin/pg_ctl.exe' '-D' 'D:\Projects\.infrapulse-23m-independent/pgdata' '-m' 'fast' '-w' 'stop'`

54. 2026-10-31T16:05:20.250Z; cwd: D:\Projects\InfraPulse

    `& 'C:/Program Files/PostgreSQL/16/bin/pg_ctl.exe' '-D' 'D:\Projects\.infrapulse-23m-independent/pgdata' '-l' 'D:\Projects\.infrapulse-23m-independent/postgres.log' '-o' '-p 5541 -h 127.0.0.1 -c shared_buffers=16MB -c max_connections=20 -c autovacuum=off' '-w' '-t' '20' 'start'`

55. 2026-10-31T16:05:47.933Z; cwd: D:\Projects\InfraPulse\backend

    `& 'C:\Program Files\nodejs\node.exe' 'src/server.js'`

56. 2026-10-31T16:05:49.792Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' '--test-concurrency=1' 'tests/cloud-lifecycle/autonomousSreIntelligence.test.js' 'tests/cloud-lifecycle/enterpriseProductionHardening.test.js' 'tests/runtime-validation/capacityZeroUtilization23m.test.mjs'`

57. 2026-10-31T16:08:20.273Z; cwd: D:\Projects\InfraPulse

    `& 'C:/Program Files/nodejs/node.exe' 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' 'ls' '--depth=0'`

58. 2026-10-31T16:08:21.013Z; cwd: D:\Projects\InfraPulse\backend

    `& 'C:/Program Files/nodejs/node.exe' 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' 'ls' '--depth=0'`

59. 2026-10-31T16:08:21.708Z; cwd: D:\Projects\InfraPulse\frontend

    `& 'C:/Program Files/nodejs/node.exe' 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' 'ls' '--depth=0'`

60. 2026-10-31T16:08:22.364Z; cwd: D:\Projects\InfraPulse\demo-services

    `& 'C:/Program Files/nodejs/node.exe' 'C:/Program Files/nodejs/node_modules/npm/bin/npm-cli.js' 'ls' '--depth=0'`

61. 2026-10-31T16:08:23.008Z; cwd: D:\Projects\InfraPulse

    `& 'git' 'status' '--short'`

62. 2026-10-31T18:28:59.300Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/runtime-validation/operationsRbac23m.test.mjs'`

63. 2026-10-31T18:29:51.775Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/runtime-validation/operationsRbac23m.test.mjs'`

64. 2026-10-31T18:30:30.074Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/runtime-validation/operationsRbac23m.test.mjs'`

65. 2026-10-31T18:30:40.088Z; cwd: D:\Projects\InfraPulse

    `& 'C:\Program Files\nodejs\node.exe' '--test' '--test-reporter=tap' 'tests/runtime-validation/operationsRbac23m.test.mjs'`

66. 2026-10-31T18:33:47.570Z; cwd: D:\Projects\InfraPulse

    `& 'git' 'status' '--short'`

67. 2026-10-31T18:38:34.647Z; cwd: D:\Projects\InfraPulse

    `& 'git' 'status' '--short'`
