/**
 * Authentication Helper for Performance & Reliability Tests
 * Logs in with real credentials against the local backend server,
 * preserving RBAC roles and returning session tokens & headers.
 */

export async function getAuthHeaders(baseUrl, role = 'admin') {
  const credentials = {
    admin: { email: 'sarah.chen@infrapulse.io', password: 'Password123!' },
    responder: { email: 'marcus.v@infrapulse.io', password: 'Password123!' },
    viewer: { email: 'alex.ross@infrapulse.io', password: 'Password123!' }
  };

  const user = credentials[role] || credentials.viewer;

  const res = await fetch(`${baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(user)
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Auth login failed for ${role} (${res.status}): ${txt}`);
  }

  const setCookie = res.headers.get('set-cookie');
  let sessionToken = '';
  if (setCookie) {
    const match = setCookie.match(/infrapulse_session=([^;]+)/);
    if (match) sessionToken = match[1];
  }

  const data = await res.json();
  const token = sessionToken || data.data?.sessionToken || '';

  return {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      'Cookie': `infrapulse_session=${token}`,
      'X-Requested-With': 'XMLHttpRequest'
    },
    user: data.data?.user,
    token
  };
}

