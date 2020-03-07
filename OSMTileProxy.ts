import {createServer, Server, IncomingHttpHeaders, IncomingMessage, ServerResponse} from 'http'
import {PassThrough, Readable} from 'stream'
import https, {RequestOptions} from 'https'

export const TileServers = {
    OpenStreetMap: 'tile.openstreetmap.org',
    OpenTopoMap: 'tile.opentotomap.org',
}

interface ProxyConfig {
    tileServer: string
    port: number
    debug?: boolean
}

export interface TileKey {
    s: string
    x: string|number
    y: string|number
    z: string|number
}

export interface TileResult {
    headers?: {
        [header: string]: string
    }
    content: Readable
}

export interface TileCache {
    save: (key: TileKey, stream: Readable, headers: IncomingHttpHeaders) => Promise<void>
    load: (key: TileKey) => Promise<TileResult|null>
}


export default class OSMTileProxy {
    constructor(private config: ProxyConfig,
                private cache: TileCache) {}

    private serveRemoteTile({s,x,y,z}, res: ServerResponse) {
        const url = `https://${s}.${this.config.tileServer}/${z}/${x}/${y}.png`

        httpsGet(url)
            .then(response => {
                const cacheStream = new PassThrough()
                const responseStream = new PassThrough()

                response.pipe(cacheStream)
                response.pipe(responseStream)
                this.cache.save({s,x,y,z}, cacheStream, response.headers)
                    .then(() => this.log('Cached', {x,y,z}))
                    .catch(err => this.log('Error caching', {x,y,z}, err))

                responseStream.pipe(res)
            })
            .catch(err => {
                this.log('Failed downloading', url, err)
                res.statusCode = 500
                return res.end('Internal Server Error')
            })
    }

    public start(): Server {
        const server = createServer((req, res) => {
            const match = /\/([abc])\/(\d{1,2})\/(\d+)\/(\d+)\.png/.exec(req.url)
            if (!match) {
                res.statusCode = 404
                return res.end('Not Found')
            }

            const [_, s, z, x, y] = match
            res.statusCode = 200
            try {
                this.log('Processing request', s, z, x, y)

                this.cache.load({s,x,y,z})
                    .then(result => {
                        if (!result) {
                            this.log('Cache miss')
                            return this.serveRemoteTile({s,x,y,z}, res)
                        }
                        this.log('Cache hit', {x,y,z})
                        for (let header in result.headers) {
                            res.setHeader(header, result.headers[header])
                        }
                        result.content.pipe(res)
                    })
                    .catch(err => {
                        this.log('Cache lookup error', err)
                        return this.serveRemoteTile({s,x,y,z}, res)
                    });
            } catch (e) {
                res.statusCode = 500
                this.log('Failed processing request', e)
                return res.end('Internal Server Error')
            }
        });

        server.listen(this.config.port)
        this.log('Started', this.config.tileServer, 'proxy on port', this.config.port)
        return server
    }

    private log(...args: any[]) {
        if (this.config.debug) {
            console.log('[OSMTileProxy]', ...args)
        }
    }
}

function httpsGet(url: string) {
    const options: RequestOptions = {
        headers: { 'User-Agent': 'OSMTileProxy kelly.banman@gmail.com' }
    }
    return new Promise<IncomingMessage>((resolve, reject) =>
        https.get(url, options, resolve).on('error', reject))
}
