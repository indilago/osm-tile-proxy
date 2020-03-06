import {Readable, ReadableOptions} from 'stream'
import {IncomingHttpHeaders} from 'http'
import zlib from 'zlib'
import S3 from 'aws-sdk/clients/s3'
import {AWSError} from 'aws-sdk/lib/error'
import {TileCache, TileResult} from './OSMTileProxy'

interface S3CacheProps {
    debug?: boolean
    bucket: string
    region?: string
    cacheLifetimeDays?: number
}

class MultiStream extends Readable {
    _object: any;
    constructor(object: any, options?: ReadableOptions) {
        super(object instanceof Buffer || typeof object === 'string' ? options : { objectMode: true });
        this._object = object;
    }
    _read = () => {
        this.push(this._object);
        this._object = null;
    };
}

/**
 * Make sure to set AWS_NODEJS_CONNECTION_REUSE_ENABLED=1
 * https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/node-reusing-connections.html
 */
export default class S3Cache implements TileCache {
    private readonly debug: boolean
    private readonly s3: S3

    constructor(private config: S3CacheProps) {
        this.debug = config.debug
        this.s3 = new S3({
            region: config.region || process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
        })
    }

    async load(key): Promise<TileResult | null> {
        const params: S3.GetObjectRequest = {
            Bucket: this.config.bucket,
            Key: makeKey(key)
        }

        if (this.config.cacheLifetimeDays) {
            params.IfModifiedSince = new Date(new Date().setDate(new Date().getDate()-this.config.cacheLifetimeDays))
        }

        return this.s3.getObject(params).promise()
            .then(res => {
                let body: Readable
                if (typeof (<Readable>res.Body).pipe === 'function') {
                    body = <Readable>res.Body
                } else {
                    body = new MultiStream(res.Body)
                }
                return {
                    headers: {
                        'Content-Type': res.ContentType,
                        'Content-Encoding': res.ContentEncoding,
                    },
                    content: body
                }
            })
            .catch((err: AWSError) => {
                if (err.code === 'NoSuchKey') {
                    return null
                }
                this.log('S3 error', err)
                return null
            })
    }

    save(key, stream: Readable, headers: IncomingHttpHeaders): Promise<void> {
        let body = stream.pipe(zlib.createGzip())
        return this.s3.upload({
            Bucket: this.config.bucket,
            Key: makeKey(key),
            Body: body,
            ContentType: headers['content-type'],
            ContentEncoding: 'gzip',
        }).promise()
            .then(() => null)
    }

    log(...args: any[]) {
        if (this.debug) {
            console.log('[FileSystemCache]', ...args)
        }
    }
}

function makeKey({s,x,y,z}): string {
    return `${s}/${x}/${y}/${z}`
}
