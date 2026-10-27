package com.cabsafe.chennai.data.remote

import com.cabsafe.chennai.BuildConfig
import com.cabsafe.chennai.data.local.SecureTokenStore
import com.cabsafe.chennai.data.model.*
import okhttp3.Interceptor
import okhttp3.OkHttpClient
import retrofit2.Response
import retrofit2.Retrofit
import retrofit2.converter.gson.GsonConverterFactory
import retrofit2.http.*
import java.util.concurrent.TimeUnit

interface CabSafeApiService {

    // ---------------- Passenger Auth & Profile (/users/*) ----------------
    @POST("/users/register")
    suspend fun registerUser(@Body body: RegisterUserRequest): Response<AuthUserResponse>

    @POST("/users/login")
    suspend fun loginUser(@Body body: LoginRequest): Response<AuthUserResponse>

    @GET("/users/profile")
    suspend fun getUserProfile(@Header("X-CabSafe-Role") role: String = "user"): Response<UserDto>

    @POST("/users/logout")
    suspend fun logoutUser(@Header("X-CabSafe-Role") role: String = "user"): Response<Map<String, String>>

    // ---------------- Captain Auth, Status & Location (/captains/*) ----------------
    @POST("/captains/register")
    suspend fun registerCaptain(@Body body: RegisterCaptainRequest): Response<AuthCaptainResponse>

    @POST("/captains/login")
    suspend fun loginCaptain(@Body body: LoginRequest): Response<AuthCaptainResponse>

    @GET("/captains/profile")
    suspend fun getCaptainProfile(@Header("X-CabSafe-Role") role: String = "captain"): Response<CaptainDto>

    @PATCH("/captains/status")
    suspend fun updateCaptainStatus(
        @Body body: UpdateCaptainStatusRequest,
        @Header("X-CabSafe-Role") role: String = "captain"
    ): Response<CaptainDto>

    @POST("/captains/location")
    suspend fun updateCaptainLocation(
        @Body body: UpdateCaptainLocationRequest,
        @Header("X-CabSafe-Role") role: String = "captain"
    ): Response<CaptainDto>

    @POST("/captains/logout")
    suspend fun logoutCaptain(@Header("X-CabSafe-Role") role: String = "captain"): Response<Map<String, String>>

    // ---------------- Chennai Maps & Boundary Routes (/maps/*) ----------------
    @GET("/maps/landmarks")
    suspend fun getChennaiLandmarks(): Response<List<LandmarkSuggestionDto>>

    @GET("/maps/get-suggestions")
    suspend fun getAddressSuggestions(
        @Query("input") input: String,
        @Header("X-CabSafe-Role") role: String = "user"
    ): Response<List<LandmarkSuggestionDto>>

    @GET("/maps/reverse-geocode")
    suspend fun reverseGeocode(
        @Query("lat") lat: Double,
        @Query("lon") lon: Double,
        @Header("X-CabSafe-Role") role: String = "user"
    ): Response<ReverseGeocodeResponse>

    // ---------------- Ride Lifecycle Routes (/rides/*) ----------------
    @GET("/rides/get-fare")
    suspend fun getFareEstimate(
        @Query("pickup") pickup: String,
        @Query("destination") destination: String,
        @Query("pickupLat") pickupLat: Double? = null,
        @Query("pickupLon") pickupLon: Double? = null,
        @Query("destLat") destLat: Double? = null,
        @Query("destLon") destLon: Double? = null,
        @Header("X-CabSafe-Role") role: String = "user"
    ): Response<FareEstimateResponseDto>

    @POST("/rides/create")
    suspend fun createRide(
        @Body body: CreateRideRequest,
        @Header("X-CabSafe-Role") role: String = "user"
    ): Response<RideDto>

    @POST("/rides/confirm")
    suspend fun confirmRide(
        @Body body: ConfirmRideRequest,
        @Header("X-CabSafe-Role") role: String = "captain"
    ): Response<RideDto>

    @POST("/rides/start-ride")
    suspend fun startRideWithOtp(
        @Body body: StartRideOtpRequest,
        @Header("X-CabSafe-Role") role: String = "captain"
    ): Response<RideDto>

    @POST("/rides/end-ride")
    suspend fun endRide(
        @Body body: EndRideRequest,
        @Header("X-CabSafe-Role") role: String = "captain"
    ): Response<RideDto>

    @POST("/rides/cancel")
    suspend fun cancelRide(
        @Body body: CancelRideRequest,
        @Header("X-CabSafe-Role") role: String
    ): Response<RideDto>

    @GET("/rides/active")
    suspend fun getActiveRide(
        @Header("X-CabSafe-Role") role: String
    ): Response<ActiveRideResponseDto>

    @GET("/rides/history")
    suspend fun getRideHistory(
        @Header("X-CabSafe-Role") role: String
    ): Response<List<RideDto>>

    @POST("/rides/pay")
    suspend fun payAndRateRide(
        @Body body: PayAndRateRequest,
        @Header("X-CabSafe-Role") role: String = "user"
    ): Response<RideDto>
}

object CabSafeNetworkModule {

    fun createApiService(tokenStore: SecureTokenStore): CabSafeApiService {
        val authInterceptor = Interceptor { chain ->
            val original = chain.request()
            val requestedRole = original.header("X-CabSafe-Role") ?: tokenStore.activeRole
            val token = tokenStore.getToken(requestedRole)

            val builder = original.newBuilder()
                .removeHeader("X-CabSafe-Role")
                .header("Accept", "application/json")

            if (!token.isNullOrBlank()) {
                builder.header("Authorization", "Bearer $token")
            }

            chain.proceed(builder.build())
        }

        // Release hygiene: Do not attach BODY logging interceptors that could print tokens or OTPs
        val client = OkHttpClient.Builder()
            .addInterceptor(authInterceptor)
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()

        val baseUrl = if (BuildConfig.CABSAFE_BASE_URL.endsWith("/")) {
            BuildConfig.CABSAFE_BASE_URL
        } else {
            "${BuildConfig.CABSAFE_BASE_URL}/"
        }

        return Retrofit.Builder()
            .baseUrl(baseUrl)
            .client(client)
            .addConverterFactory(GsonConverterFactory.create())
            .build()
            .create(CabSafeApiService::class.java)
    }
}
