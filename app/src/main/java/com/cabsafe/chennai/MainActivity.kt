package com.cabsafe.chennai

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Tab
import androidx.compose.material3.TabRow
import androidx.compose.material3.Text
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import com.cabsafe.chennai.data.local.SecureTokenStore
import com.cabsafe.chennai.data.remote.CabSafeSocketManager
import com.cabsafe.chennai.data.repository.CabSafeRepository
import com.cabsafe.chennai.ui.screens.CaptainScreen
import com.cabsafe.chennai.ui.screens.PassengerScreen
import com.cabsafe.chennai.ui.viewmodel.CaptainViewModel
import com.cabsafe.chennai.ui.viewmodel.PassengerViewModel

class MainActivity : ComponentActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        val tokenStore = SecureTokenStore(applicationContext)
        val repository = CabSafeRepository(tokenStore = tokenStore)
        val passengerSocket = CabSafeSocketManager(baseUrl = BuildConfig.CABSAFE_SOCKET_URL)
        val captainSocket = CabSafeSocketManager(baseUrl = BuildConfig.CABSAFE_SOCKET_URL)

        val passengerViewModel = PassengerViewModel(repository, passengerSocket)
        val captainViewModel = CaptainViewModel(repository, captainSocket)

        setContent {
            MaterialTheme {
                var selectedTabIndex by remember { mutableIntStateOf(0) }

                DisposableEffect(Unit) {
                    onDispose {
                        passengerSocket.disconnect()
                        captainSocket.disconnect()
                    }
                }

                Scaffold(
                    topBar = {
                        Column {
                            TabRow(selectedTabIndex = selectedTabIndex) {
                                Tab(
                                    selected = selectedTabIndex == 0,
                                    onClick = { selectedTabIndex = 0 },
                                    text = { Text("Passenger App") }
                                )
                                Tab(
                                    selected = selectedTabIndex == 1,
                                    onClick = { selectedTabIndex = 1 },
                                    text = { Text("Driver App") }
                                )
                            }
                        }
                    }
                ) { innerPadding ->
                    if (selectedTabIndex == 0) {
                        PassengerScreen(
                            viewModel = passengerViewModel,
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(innerPadding)
                        )
                    } else {
                        CaptainScreen(
                            viewModel = captainViewModel,
                            modifier = Modifier
                                .fillMaxSize()
                                .padding(innerPadding)
                        )
                    }
                }
            }
        }
    }
}
