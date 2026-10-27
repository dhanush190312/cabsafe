package com.cabsafe.chennai

import android.app.Application
import com.cabsafe.chennai.data.local.SecureTokenStore
import com.cabsafe.chennai.data.remote.CabSafeNetworkModule
import com.cabsafe.chennai.data.remote.CabSafeSocketManager
import com.cabsafe.chennai.data.repository.CabSafeRepository
import org.osmdroid.config.Configuration
import java.io.File

class CabSafeApplication : Application() {

    lateinit var tokenStore: SecureTokenStore
        private set

    lateinit var socketManager: CabSafeSocketManager
        private set

    lateinit var repository: CabSafeRepository
        private set

    override fun onCreate() {
        super.onCreate()

        // Configure osmdroid tile cache and required User-Agent per OpenStreetMap Tile Usage Policy.
        // No paid API key is required for OSM development tiles; production tile URLs are injected via BuildConfig.
        val osmConfig = Configuration.getInstance()
        osmConfig.userAgentValue = "CabSafe-Chennai-Android/${BuildConfig.VERSION_NAME}"
        osmConfig.osmdroidBasePath = File(cacheDir, "osmdroid")
        osmConfig.osmdroidTileCache = File(osmConfig.osmdroidBasePath, "tiles")

        tokenStore = SecureTokenStore(applicationContext)
        val apiService = CabSafeNetworkModule.createApiService(tokenStore)
        socketManager = CabSafeSocketManager(baseUrl = BuildConfig.CABSAFE_SOCKET_URL)
        repository = CabSafeRepository(tokenStore = tokenStore, api = apiService)
    }
}
