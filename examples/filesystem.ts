import OSMTileProxy, {TileServers} from '../OSMTileProxy'
import FileSystemCache from '../FileSystemCache'

const fsCache = new FileSystemCache()

const proxy = new OSMTileProxy({
    port: 3030,
    debug: true,
    tileServer: TileServers.OpenStreetMap,
}, fsCache)

proxy.start()
