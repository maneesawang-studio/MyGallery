const API_VERSION = '2022-11-28';
const PROJECTS_PATH = 'data/projects.json';
const SITE_BASE_URL = 'https://maneesawang-studio.github.io/MyGallery/';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const ALLOWED_IMAGE_TYPES = new Map([
    ['image/jpeg', 'jpg'],
    ['image/png', 'png'],
    ['image/webp', 'webp']
]);

function jsonResponse(data, status, origin, extraHeaders = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=utf-8',
            'Cache-Control': 'no-store',
            'Access-Control-Allow-Origin': origin,
            'Access-Control-Allow-Credentials': 'false',
            'Vary': 'Origin',
            ...extraHeaders
        }
    });
}

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, PUT, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        'Vary': 'Origin'
    };
}

function getAllowedUsers(env) {
    return (env.ALLOWED_GITHUB_USERS || '')
        .split(',')
        .map(username => username.trim().toLowerCase())
        .filter(Boolean);
}

function githubHeaders(token, json = false) {
    return {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': API_VERSION,
        'User-Agent': 'MNSW-Studio-Content-Admin',
        ...(json ? { 'Content-Type': 'application/json' } : {})
    };
}

async function githubRequest(path, token, options = {}) {
    const response = await fetch(`https://api.github.com${path}`, {
        ...options,
        headers: {
            ...githubHeaders(token, Boolean(options.body)),
            ...options.headers
        }
    });
    const body = await response.json().catch(() => null);
    if (!response.ok) {
        const error = new Error(body?.message || `GitHub API request failed (${response.status})`);
        error.status = response.status;
        throw error;
    }
    return body;
}

async function getAuthorizedUser(token, env) {
    const user = await githubRequest('/user', token);
    if (!getAllowedUsers(env).includes(String(user.login || '').toLowerCase())) {
        throw new Error('This GitHub account is not allowed to manage this site.');
    }

    const repository = await githubRequest(
        `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`,
        token
    );
    if (repository.permissions?.push !== true) {
        throw new Error('This GitHub account does not have write access to the configured repository.');
    }
    return user;
}

function createRandomState() {
    const bytes = crypto.getRandomValues(new Uint8Array(32));
    return Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
}

function escapeHtmlJson(value) {
    return JSON.stringify(value)
        .replace(/</g, '\\u003c')
        .replace(/>/g, '\\u003e')
        .replace(/&/g, '\\u0026')
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029');
}

function binaryToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let offset = 0; offset < bytes.length; offset += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
    }
    return btoa(binary);
}

function oauthCallbackPage(payload, origin, clearStateCookie) {
    const nonce = createRandomState();
    const safePayload = escapeHtmlJson(payload);
    const html = `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>GitHub sign-in</title><body><p id="status">Returning to MNSW Studio Admin…</p><script nonce="${nonce}">(()=>{const payload=${safePayload};const target=${escapeHtmlJson(origin)};if(window.opener){window.opener.postMessage({type:"mnsw-github-auth",...payload},target);window.close()}else{document.getElementById("status").textContent="Return to the admin tab to continue."}})()</script></body></html>`;
    return new Response(html, {
        headers: {
            'Content-Type': 'text/html; charset=utf-8',
            'Cache-Control': 'no-store',
            'Set-Cookie': clearStateCookie,
            'Content-Security-Policy': `default-src 'none'; script-src 'nonce-${nonce}'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
            'Referrer-Policy': 'no-referrer',
            'X-Content-Type-Options': 'nosniff',
            'X-Frame-Options': 'DENY'
        }
    });
}

async function handleOAuthCallback(request, env) {
    const url = new URL(request.url);
    const stateCookie = request.headers.get('Cookie')?.match(/(?:^|;\s*)oauth_state=([^;]+)/)?.[1];
    const returnedState = url.searchParams.get('state');
    const code = url.searchParams.get('code');
    const clearStateCookie = 'oauth_state=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Lax';
    if (!stateCookie || !returnedState || stateCookie !== returnedState || !code) {
        return new Response('Invalid or expired GitHub sign-in state.', { status: 400, headers: { 'Set-Cookie': clearStateCookie } });
    }

    const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            code,
            redirect_uri: `${url.origin}/auth/callback`
        })
    });
    const tokenData = await tokenResponse.json();
    if (!tokenResponse.ok || !tokenData.access_token) {
        return new Response('GitHub sign-in failed. Please retry from the admin page.', { status: 502, headers: { 'Set-Cookie': clearStateCookie } });
    }

    try {
        await getAuthorizedUser(tokenData.access_token, env);
    } catch (error) {
        return new Response(error.message, {
            status: 403,
            headers: { 'Set-Cookie': clearStateCookie, 'Cache-Control': 'no-store' }
        });
    }

    return oauthCallbackPage({
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        expiresIn: tokenData.expires_in || 28800,
        refreshTokenExpiresIn: tokenData.refresh_token_expires_in || null
    }, env.ADMIN_ORIGIN, clearStateCookie);
}

async function refreshOAuthToken(request, env, origin) {
    const body = await request.json();
    if (typeof body.refreshToken !== 'string' || !body.refreshToken) {
        return jsonResponse({ error: 'A valid refresh token is required.' }, 400, origin);
    }

    const response = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({
            client_id: env.GITHUB_CLIENT_ID,
            client_secret: env.GITHUB_CLIENT_SECRET,
            grant_type: 'refresh_token',
            refresh_token: body.refreshToken
        })
    });
    const tokenData = await response.json();
    if (!response.ok || !tokenData.access_token) {
        return jsonResponse({ error: 'GitHub session expired. Sign in again.' }, 401, origin);
    }

    try {
        const user = await getAuthorizedUser(tokenData.access_token, env);
        return jsonResponse({
            accessToken: tokenData.access_token,
            refreshToken: tokenData.refresh_token || null,
            expiresIn: tokenData.expires_in || 28800,
            username: user.login
        }, 200, origin);
    } catch (error) {
        return jsonResponse({ error: error.message }, 403, origin);
    }
}

async function saveRepositoryFile(path, content, message, token, env) {
    const repoPath = `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`;
    let sha;
    try {
        const existing = await githubRequest(`${repoPath}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`, token);
        sha = existing.sha;
    } catch (error) {
        if (error.status !== 404) throw error;
    }

    const result = await githubRequest(repoPath, token, {
        method: 'PUT',
        body: JSON.stringify({
            message,
            content: typeof content === 'string' ? content : binaryToBase64(content),
            branch: env.GITHUB_BRANCH,
            ...(sha ? { sha } : {})
        })
    });
    return result.content.path;
}

async function saveProjectsAndSitemap(projects, token, env) {
    const repositoryPath = `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}`;
    const ref = await githubRequest(`${repositoryPath}/git/ref/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`, token);
    const parentSha = ref.object.sha;
    const parentCommit = await githubRequest(`${repositoryPath}/git/commits/${parentSha}`, token);
    const projectContent = JSON.stringify(projects, null, 2) + '\n';
    const projectUrls = projects.map(project =>
        `    <url><loc>${SITE_BASE_URL}ProjectDetail/?id=${encodeURIComponent(project.id)}</loc></url>`
    );
    const sitemapContent = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        `    <url><loc>${SITE_BASE_URL}</loc></url>`,
        `    <url><loc>${SITE_BASE_URL}Gallery/</loc></url>`,
        `    <url><loc>${SITE_BASE_URL}About/</loc></url>`,
        ...projectUrls,
        '</urlset>',
        ''
    ].join('\n');
    const projectBlob = await githubRequest(`${repositoryPath}/git/blobs`, token, {
        method: 'POST',
        body: JSON.stringify({ content: projectContent, encoding: 'utf-8' })
    });
    const sitemapBlob = await githubRequest(`${repositoryPath}/git/blobs`, token, {
        method: 'POST',
        body: JSON.stringify({ content: sitemapContent, encoding: 'utf-8' })
    });
    const tree = await githubRequest(`${repositoryPath}/git/trees`, token, {
        method: 'POST',
        body: JSON.stringify({
            base_tree: parentCommit.tree.sha,
            tree: [
                { path: PROJECTS_PATH, mode: '100644', type: 'blob', sha: projectBlob.sha },
                { path: 'sitemap.xml', mode: '100644', type: 'blob', sha: sitemapBlob.sha }
            ]
        })
    });
    const commit = await githubRequest(`${repositoryPath}/git/commits`, token, {
        method: 'POST',
        body: JSON.stringify({
            message: 'Update portfolio projects from admin',
            tree: tree.sha,
            parents: [parentSha]
        })
    });
    await githubRequest(`${repositoryPath}/git/refs/heads/${encodeURIComponent(env.GITHUB_BRANCH)}`, token, {
        method: 'PATCH',
        body: JSON.stringify({ sha: commit.sha, force: false })
    });
    return commit.sha;
}

async function handleApi(request, env, origin) {
    const token = request.headers.get('Authorization')?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!token) return jsonResponse({ error: 'GitHub sign-in required.' }, 401, origin);

    let user;
    try {
        user = await getAuthorizedUser(token, env);
    } catch (error) {
        return jsonResponse({ error: error.message }, 403, origin);
    }

    const url = new URL(request.url);
    if (url.pathname === '/api/session' && request.method === 'GET') {
        return jsonResponse({ username: user.login, repository: `${env.GITHUB_OWNER}/${env.GITHUB_REPO}` }, 200, origin);
    }

    if (url.pathname === '/api/projects' && request.method === 'GET') {
        const path = `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/contents/${PROJECTS_PATH}?ref=${encodeURIComponent(env.GITHUB_BRANCH)}`;
        try {
            const file = await githubRequest(path, token);
            let encodedContent = file.content;
            if (!encodedContent) {
                const blob = await githubRequest(
                    `/repos/${encodeURIComponent(env.GITHUB_OWNER)}/${encodeURIComponent(env.GITHUB_REPO)}/git/blobs/${file.sha}`,
                    token
                );
                if (blob.encoding !== 'base64' || typeof blob.content !== 'string') {
                    throw new Error('The project data file could not be decoded.');
                }
                encodedContent = blob.content;
            }
            const decoded = atob(encodedContent.replace(/\s/g, ''));
            const bytes = Uint8Array.from(decoded, character => character.charCodeAt(0));
            return new Response(bytes, {
                headers: {
                    ...corsHeaders(origin),
                    'Content-Type': 'application/json; charset=utf-8',
                    'Cache-Control': 'no-store'
                }
            });
        } catch (error) {
            if (error.status === 404) return jsonResponse({ error: `${PROJECTS_PATH} was not found in the repository.` }, 404, origin);
            throw error;
        }
    }

    if (url.pathname === '/api/projects' && request.method === 'PUT') {
        const body = await request.json();
        if (!Array.isArray(body.projects) || body.projects.length > 500) {
            return jsonResponse({ error: 'Projects must be an array containing no more than 500 items.' }, 400, origin);
        }
        const projectIds = new Set();
        for (const [index, project] of body.projects.entries()) {
            if (!project || typeof project !== 'object' || Array.isArray(project) ||
                typeof project.id !== 'string' || project.id.length > 80 || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(project.id) ||
                projectIds.has(project.id) || typeof project.title !== 'string' || !project.title.trim() ||
                project.title.length > 120 || typeof project.subTitle !== 'string' || project.subTitle.length > 120 ||
                typeof project.year !== 'string' || !/^\d{4}$/.test(project.year) ||
                typeof project.image !== 'string' || !/^image\/[a-zA-Z0-9_./ -]+\.(?:png|jpe?g|webp)$/i.test(project.image) ||
                !project.concept || typeof project.concept !== 'object' || Array.isArray(project.concept) ||
                !project.description || typeof project.description !== 'object' || Array.isArray(project.description) ||
                !Array.isArray(project.fields) || project.fields.length > 50) {
                return jsonResponse({ error: `Project at index ${index} contains invalid data.` }, 400, origin);
            }
            projectIds.add(project.id);
        }
        const serialized = JSON.stringify(body.projects, null, 2);
        if (new TextEncoder().encode(serialized).length > 5 * 1024 * 1024) {
            return jsonResponse({ error: 'The projects data exceeds the 5 MB limit.' }, 413, origin);
        }
        const commit = await saveProjectsAndSitemap(body.projects, token, env);
        return jsonResponse({ path: PROJECTS_PATH, commit }, 200, origin);
    }

    if (url.pathname === '/api/images' && request.method === 'POST') {
        const contentLength = Number(request.headers.get('Content-Length') || 0);
        if (contentLength > MAX_IMAGE_BYTES * 1.4) {
            return jsonResponse({ error: 'Image files must be 5 MB or smaller.' }, 413, origin);
        }
        const body = await request.json();
        const extension = ALLOWED_IMAGE_TYPES.get(body.mimeType);
        if (!extension || typeof body.base64 !== 'string' || !body.base64) {
            return jsonResponse({ error: 'Upload a PNG, JPEG, or WebP image.' }, 400, origin);
        }
        const base64 = body.base64.replace(/^data:[^,]+,/, '');
        const imageBytes = Uint8Array.from(atob(base64), character => character.charCodeAt(0));
        if (imageBytes.length === 0 || imageBytes.length > MAX_IMAGE_BYTES) {
            return jsonResponse({ error: 'Image files must be between 1 byte and 5 MB.' }, 413, origin);
        }
        const isPng = body.mimeType === 'image/png' &&
            imageBytes.length >= 8 &&
            imageBytes[0] === 0x89 && imageBytes[1] === 0x50 && imageBytes[2] === 0x4e && imageBytes[3] === 0x47 &&
            imageBytes[4] === 0x0d && imageBytes[5] === 0x0a && imageBytes[6] === 0x1a && imageBytes[7] === 0x0a;
        const isJpeg = body.mimeType === 'image/jpeg' &&
            imageBytes.length >= 3 && imageBytes[0] === 0xff && imageBytes[1] === 0xd8 && imageBytes[2] === 0xff;
        const isWebp = body.mimeType === 'image/webp' &&
            imageBytes.length >= 12 &&
            String.fromCharCode(...imageBytes.subarray(0, 4)) === 'RIFF' &&
            String.fromCharCode(...imageBytes.subarray(8, 12)) === 'WEBP';
        if (!isPng && !isJpeg && !isWebp) {
            return jsonResponse({ error: 'The file content does not match a PNG, JPEG, or WebP image.' }, 400, origin);
        }
        const filename = typeof body.filename === 'string' ? body.filename : 'project-image';
        const safeName = filename
            .replace(/\.[^.]*$/, '')
            .normalize('NFKD')
            .replace(/[^a-zA-Z0-9-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 48) || 'project-image';
        const path = `image/projects/${crypto.randomUUID()}-${safeName}.${extension}`;
        const savedPath = await saveRepositoryFile(path, imageBytes, `Add portfolio image ${safeName}`, token, env);
        return jsonResponse({ path: savedPath }, 201, origin);
    }

    return jsonResponse({ error: 'API endpoint not found.' }, 404, origin);
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const origin = request.headers.get('Origin');
        const configuredOrigin = env.ADMIN_ORIGIN;

        if (url.pathname === '/auth/callback' && request.method === 'GET') {
            if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET || !configuredOrigin) {
                return new Response('The GitHub App or admin origin is not configured.', { status: 503 });
            }
            return handleOAuthCallback(request, env);
        }

        if (url.pathname === '/auth/login' && request.method === 'GET') {
            const refererOrigin = (() => {
                try {
                    return new URL(request.headers.get('Referer')).origin;
                } catch {
                    return '';
                }
            })();
            if (origin !== configuredOrigin && !(origin === null && refererOrigin === configuredOrigin)) {
                return new Response('Origin not allowed.', { status: 403 });
            }
            if (!env.GITHUB_CLIENT_ID) {
                return jsonResponse({ error: 'The GitHub App is not configured.' }, 503, configuredOrigin, corsHeaders(configuredOrigin));
            }
            const state = createRandomState();
            const callbackUrl = `${url.origin}/auth/callback`;
            const authorizeUrl = new URL('https://github.com/login/oauth/authorize');
            authorizeUrl.searchParams.set('client_id', env.GITHUB_CLIENT_ID);
            authorizeUrl.searchParams.set('redirect_uri', callbackUrl);
            authorizeUrl.searchParams.set('state', state);
            authorizeUrl.searchParams.set('allow_signup', 'false');
            return new Response(null, {
                status: 302,
                headers: {
                    Location: authorizeUrl.toString(),
                    'Set-Cookie': `oauth_state=${state}; Max-Age=600; Path=/; Secure; HttpOnly; SameSite=Lax`,
                    'Cache-Control': 'no-store'
                }
            });
        }

        if (origin !== configuredOrigin) {
            return new Response('Origin not allowed.', { status: 403 });
        }

        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders(configuredOrigin) });
        }

        if (url.pathname === '/auth/refresh' && request.method === 'POST') {
            return refreshOAuthToken(request, env, configuredOrigin);
        }

        if (url.pathname.startsWith('/api/')) {
            try {
                return await handleApi(request, env, configuredOrigin);
            } catch (error) {
                console.error('Admin API request failed:', error.message);
                const status = error.status === 409 || error.status === 422 ? 409 : 502;
                return jsonResponse({ error: error.message || 'GitHub API request failed.' }, status, configuredOrigin);
            }
        }

        return jsonResponse({ error: 'Endpoint not found.' }, 404, configuredOrigin, corsHeaders(configuredOrigin));
    }
};
