import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.compose")
}

val localProps = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) {
        file.inputStream().use { load(it) }
    }
}

val debugBaseUrl = localProps.getProperty("CABSAFE_DEBUG_BASE_URL", "http://10.0.2.2:3000")
val debugSocketUrl = localProps.getProperty("CABSAFE_DEBUG_SOCKET_URL", debugBaseUrl)
val releaseBaseUrl = localProps.getProperty(
    "CABSAFE_RELEASE_BASE_URL",
    "https://api.cabsafe-chennai.example.com"
)
val releaseSocketUrl = localProps.getProperty("CABSAFE_RELEASE_SOCKET_URL", releaseBaseUrl)
val mapTileUrl = localProps.getProperty("CABSAFE_MAP_TILE_URL", "https://tile.openstreetmap.org/")

android {
    namespace = "com.cabsafe.chennai"
    compileSdk = 35

    defaultConfig {
        applicationId = "com.cabsafe.chennai"
        minSdk = 26
        targetSdk = 35
        versionCode = 1
        versionName = "1.0.0-chennai"

        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        vectorDrawables {
            useSupportLibrary = true
        }

        buildConfigField("String", "MAP_TILE_URL", "\"$mapTileUrl\"")
        buildConfigField("double", "CHENNAI_DEFAULT_LAT", "13.0827")
        buildConfigField("double", "CHENNAI_DEFAULT_LON", "80.2707")
        buildConfigField("double", "CHENNAI_DEFAULT_ZOOM", "12.0")
    }

    buildTypes {
        debug {
            isMinifyEnabled = false
            buildConfigField("String", "CABSAFE_BASE_URL", "\"$debugBaseUrl\"")
            buildConfigField("String", "CABSAFE_SOCKET_URL", "\"$debugSocketUrl\"")
        }
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            buildConfigField("String", "CABSAFE_BASE_URL", "\"$releaseBaseUrl\"")
            buildConfigField("String", "CABSAFE_SOCKET_URL", "\"$releaseSocketUrl\"")
            proguardFiles(
                getDefaultProguardFile("proguard-android-optimize.txt"),
                "proguard-rules.pro"
            )
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    kotlinOptions {
        jvmTarget = "17"
    }

    buildFeatures {
        compose = true
        buildConfig = true
    }

    packaging {
        resources {
            excludes += "/META-INF/{AL2.0,LGPL2.1}"
        }
    }
}

dependencies {
    val composeBom = platform("androidx.compose:compose-bom:2024.10.01")
    implementation(composeBom)
    androidTestImplementation(composeBom)

    // Core AndroidX & Jetpack Compose Material 3
    implementation("androidx.core:core-ktx:1.15.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.8.7")
    implementation("androidx.lifecycle:lifecycle-runtime-compose:2.8.7")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.7")
    implementation("androidx.activity:activity-compose:1.9.3")
    implementation("androidx.navigation:navigation-compose:2.8.4")
    implementation("androidx.compose.ui:ui")
    implementation("androidx.compose.ui:ui-graphics")
    implementation("androidx.compose.ui:ui-tooling-preview")
    implementation("androidx.compose.material3:material3")
    implementation("androidx.compose.material:material-icons-extended")

    // Coroutines
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.9.0")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-play-services:1.9.0")

    // Retrofit2 + OkHttp3 + Gson for REST APIs (/users, /captains, /maps, /rides)
    implementation("com.squareup.retrofit2:retrofit:2.11.0")
    implementation("com.squareup.retrofit2:converter-gson:2.11.0")
    implementation("com.squareup.okhttp3:okhttp:4.12.0")
    implementation("com.squareup.okhttp3:logging-interceptor:4.12.0")
    implementation("com.google.code.gson:gson:2.11.0")

    // Socket.IO Client (compatible with Socket.IO v4 server)
    implementation("io.socket:socket.io-client:2.1.1") {
        exclude(group = "org.json", module = "json")
    }

    // Native Interactive OpenStreetMap SDK (Zero-Key OSM/OSRM compatible)
    implementation("org.osmdroid:osmdroid-android:6.1.18")

    // Google Play Services FusedLocationProviderClient for device GPS
    implementation("com.google.android.gms:play-services-location:21.3.0")

    // EncryptedSharedPreferences for secure JWT token storage
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // Unit & Instrumentation Testing
    testImplementation("junit:junit:4.13.2")
    testImplementation("org.jetbrains.kotlinx:kotlinx-coroutines-test:1.9.0")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
    androidTestImplementation("androidx.compose.ui:ui-test-junit4")
    debugImplementation("androidx.compose.ui:ui-tooling")
    debugImplementation("androidx.compose.ui:ui-test-manifest")
}
