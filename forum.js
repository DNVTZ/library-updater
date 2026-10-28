const axios = require('axios');
const qs = require('qs');
const fs = require('fs');
const { forumUrl } = require('./config');

const client = axios.create({
    baseURL: forumUrl,
    validateStatus: () => true
});

function parseCookies(setCookie) {
    return setCookie.map(value => value.split(';')[0]).join('; ');
}

async function getLoginPage() {
    const response = await client.get('/login');
    const csrf = response.data.match(/name="_csrf"\s*value="([^"]+)"/)?.[1];
    const setCookie = response.headers['set-cookie'];
    if (!csrf)
        throw new Error('CSRF не найден');
    if (!setCookie || !setCookie.length)
        throw new Error('Cookie не получена');
    return { csrf, cookie: parseCookies(setCookie) };
}

async function login(username, password) {
    const { csrf, cookie } = await getLoginPage();
    const response = await client.post(
        '/login',
        qs.stringify({ _csrf: csrf, username, password }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookie,
                'Referer': `${forumUrl}/login`,
                'Origin': forumUrl
            }
        }
    );
    const newSetCookie = response.headers['set-cookie'];
    return newSetCookie && newSetCookie.length ? parseCookies(newSetCookie) : cookie;
}

async function getCategory(cookie) {
    const response = await client.get('/category/14/ecosoft-lexema8', { headers: { 'Cookie': cookie } });
    fs.writeFileSync('debug/forum-category.html', response.data, 'utf8');
    return response.data;
}

async function main() {
    const username = process.env.FORUM_USER;
    const password = process.env.FORUM_PASSWORD;
    if (!username || !password)
        throw new Error('Не заданы FORUM_USER / FORUM_PASSWORD');
    const cookie = await login(username, password);
    await getCategory(cookie);
}

main().catch(error => {
    console.error(error.message);
    if (error.response)
        console.error(error.response.status, error.response.data);
});
