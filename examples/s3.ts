import OSMTileProxy, {TileServers} from '../OSMTileProxy'
import S3Cache from '../S3Cache'

const s3cache = new S3Cache({
    bucket: 'osm-maptiles',
    debug: true,
})

const proxy = new OSMTileProxy({
    port: 3030,
    debug: true,
    tileServer: TileServers.OpenStreetMap,
}, s3cache)

proxy.start()
