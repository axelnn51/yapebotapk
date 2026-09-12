# Add project specific ProGuard rules here.
# By default, the flags in this file are appended to flags specified
# in /usr/local/Cellar/android-sdk/24.3.3/tools/proguard/proguard-android.txt
# You can edit the include path and order by changing the proguardFiles
# directive in build.gradle.
#
# For more details, see
#   http://developer.android.com/guide/developing/tools/proguard.html

# react-native-reanimated
-keep class com.swmansion.reanimated.** { *; }
-keep class com.facebook.react.turbomodule.** { *; }

# react-native-android-notification-listener
-keep class com.lesimoes.androidnotificationlistener.** { *; }

# Expo Modules & Kotlin Reflection
-keep class expo.modules.** { *; }
-keep class expo.modules.kotlin.** { *; }
-keep interface expo.modules.** { *; }
-keep @interface expo.modules.** { *; }

# React Native Core
-keep class com.facebook.react.** { *; }
-keep class com.facebook.jni.** { *; }
-keep class com.facebook.fbreact.** { *; }
-keep class com.facebook.soloader.** { *; }

# Async Storage
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# Google Firebase & Play Services
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

