import fs from 'fs'
import {Readable} from 'stream'
import {IncomingHttpHeaders} from 'http'
import Loki from 'lokijs'
import {TileCache, TileKey, TileResult} from './OSMTileProxy'

interface TileRecord extends TileKey {
    filename: string
    mimeType: string
}

export default class FileSystemCache implements TileCache {
    private readonly db: Loki
    private readonly debug: boolean

    constructor(config?: { debug: boolean }) {
        this.debug = config?.debug
        this.db = new Loki('tile-db.json', {persistenceMethod: 'fs'})
    }

    async load(key): Promise<TileResult | null> {
        const col = this.loadCollection('tiles')
        const result = col.findOne(key)
        this.log('search in db', result)
        if (result) {
            return {
                headers: {'Content-Type': result.mimeType},
                content: fs.createReadStream(result.filename),
            }
        }
    }

    save({s, x, y, z}, stream: Readable, headers: IncomingHttpHeaders): Promise<void> {
        const filename = `tiles/${s}-${z}-${x}-${y}.png`
        const mimeType = headers['content-type']

        return new Promise<void>((resolve, reject) => {
            const file = fs.createWriteStream(filename)
            stream.pipe(file)
            file.on('close', () => resolve())
            file.on('finish', () => file.close())
            file.on('error', reject)
        }).then(() => {
            this.loadCollection('tiles').insert({s, x, y, z, filename, mimeType})
            this.db.saveDatabase()
        })
    }

    loadCollection(colName: string): Loki.Collection<TileRecord> {
        return this.db.getCollection(colName) || this.db.addCollection(colName)
    }

    log(...args: any[]) {
        if (this.debug) {
            console.log('[FileSystemCache]', ...args)
        }
    }
}
