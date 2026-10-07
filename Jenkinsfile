// Jenkins = Build, Test, Deploy. (Monitoring/recovery is NOT done here.)
// Assumes Jenkins runs on the EC2 host with Node.js, Docker and Docker Compose installed,
// and the jenkins user is in the docker group.
pipeline {
  agent any
  options { timestamps() }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Install')  { steps { sh 'npm ci || npm install' } }
    stage('Test')     { steps { sh 'npm test' } }
    stage('Build')    { steps { sh 'docker compose build' } }
    stage('Deploy')   { steps { sh 'docker compose up -d' } }
    stage('Verify') {
      steps {
        // Fail the build if /health does not return 200 within ~60s
        sh '''
          for i in $(seq 1 12); do
            if curl -fsS http://localhost:3000/health; then echo; echo "Deployment verified"; exit 0; fi
            echo "Waiting for app... ($i/12)"; sleep 5
          done
          echo "Verification FAILED"; docker compose logs --tail=50; exit 1
        '''
      }
    }
  }
  post {
    success { echo 'Pipeline succeeded' }
    failure { echo 'Pipeline failed' }
  }
}
