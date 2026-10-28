const axios = require('axios');
const qs = require('qs');
const fs = require('fs');

const client = axios.create({
    baseURL: 'http://forum.lex.lan',
    validateStatus: () => true
});

async function getLoginPage() {

    const response = await client.get('/login');

    const html = response.data;

    const csrf =
        html.match(/name="_csrf"\s+value="([^"]+)"/)?.[1] ||
        html.match(/name="_csrf"\s*value="([^"]+)"/)?.[1];

    const setCookie = response.headers['set-cookie'];

    if (!csrf)
        throw new Error('CSRF не найден');

    if (!setCookie || !setCookie.length)
        throw new Error('Cookie не получена');

    const cookie = setCookie
        .map(value => value.split(';')[0])
        .join('; ');

    return {
        csrf,
        cookie
    };
}

async function login(username, password) {

    const { csrf, cookie } = await getLoginPage();

    const response = await client.post(
        '/login',
        qs.stringify({
            _csrf: csrf,
            username,
            password
        }),
        {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Cookie': cookie,
                'Referer': 'http://forum.lex.lan/login',
                'Origin': 'http://forum.lex.lan'
            }
        }
    );

    const newSetCookie = response.headers['set-cookie'];

    if (newSetCookie && newSetCookie.length) {
        return newSetCookie
            .map(value => value.split(';')[0])
            .join('; ');
    }

    return cookie;
}

async function getCategory(cookie) {

    const response = await client.get(
        '/category/14/ecosoft-lexema8',
        {
            headers: {
                'Cookie': cookie
            }
        }
    );

    fs.writeFileSync(
        'debug/forum-category.html',
        response.data,
        'utf8'
    );

    return response.data;
}

async function main() {

    const username = process.env.FORUM_USER;
    const password = process.env.FORUM_PASSWORD;

    if (!username || !password)
        throw new Error('Не заданы FORUM_USER / FORUM_PASSWORD');

    const cookie = await login(
        username,
        password
    );

    await getCategory(cookie);
}

main().catch(error => {

    console.error(error.message);

    if (error.response) {
        console.error(
            error.response.status,
            error.response.data
        );
    }

});