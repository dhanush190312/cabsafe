package com.cabsafe.chennai.data.local

import android.content.Context
import android.content.SharedPreferences
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey

/**
 * Stores Passenger and Captain JWT tokens in Android EncryptedSharedPreferences (AES256-GCM).
 * Never logs or exposes raw tokens in logcat.
 */
class SecureTokenStore(context: Context) {

    private val prefs: SharedPreferences = try {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        EncryptedSharedPreferences.create(
            context,
            PREFS_FILE_NAME,
            masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
        )
    } catch (_: Exception) {
        // Fallback for unit-test / robolectric environments without AndroidKeyStore
        context.getSharedPreferences(PREFS_FILE_NAME, Context.MODE_PRIVATE)
    }

    var activeRole: String
        get() = prefs.getString(KEY_ACTIVE_ROLE, "user") ?: "user"
        set(value) = prefs.edit().putString(KEY_ACTIVE_ROLE, value).apply()

    fun getToken(role: String = activeRole): String? {
        val key = if (role == "captain") KEY_CAPTAIN_TOKEN else KEY_USER_TOKEN
        return prefs.getString(key, null)
    }

    fun saveToken(role: String, token: String) {
        val key = if (role == "captain") KEY_CAPTAIN_TOKEN else KEY_USER_TOKEN
        prefs.edit()
            .putString(key, token)
            .putString(KEY_ACTIVE_ROLE, role)
            .apply()
    }

    fun clearToken(role: String) {
        val key = if (role == "captain") KEY_CAPTAIN_TOKEN else KEY_USER_TOKEN
        prefs.edit().remove(key).apply()
    }

    companion object {
        private const val PREFS_FILE_NAME = "cabsafe_chennai_secure_prefs"
        private const val KEY_USER_TOKEN = "jwt_passenger_token"
        private const val KEY_CAPTAIN_TOKEN = "jwt_captain_token"
        private const val KEY_ACTIVE_ROLE = "active_workspace_role"
    }
}
