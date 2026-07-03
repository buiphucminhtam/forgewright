using System;
using System.IO;
using System.Security.Cryptography;
using System.Text;
using UnityEngine;

namespace Forgewright.Gameplay
{
    /// <summary>
    /// Professional Encrypted Save/Load system for Unity.
    /// Uses AES-256 (CBC mode) to encrypt local save files to secure game progression against client-side hacks.
    /// </summary>
    public class SaveSystemUnity : MonoBehaviour
    {
        private static readonly string EncryptionKey = "F0rg3wr1ght_K3y_S3cr3t_256B1ts!"; // Must be exactly 32 chars for AES-256
        private static readonly string EncryptionIV = "InitVector16Char"; // Must be exactly 16 chars

        private string saveFilePath;

        [System.Serializable]
        public class PlayerData
        {
            public string version = "1.0.0";
            public long timestamp;
            public int playerLevel = 1;
            public int playerXP = 0;
            public int gold = 100;
            public int gems = 10;
            public string[] unlockedAbilities = new string[0];
        }

        private void Awake()
        {
            saveFilePath = Path.Combine(Application.persistentDataPath, "save_game.dat");
        }

        /// <summary>
        /// Saves player data to disk with AES encryption.
        /// </summary>
        public bool SaveGame(PlayerData data)
        {
            try
            {
                data.timestamp = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
                string json = JsonUtility.ToJson(data);
                byte[] encryptedBytes = Encrypt(json, EncryptionKey, EncryptionIV);

                File.WriteAllBytes(saveFilePath, encryptedBytes);
                return true;
            }
            catch (Exception e)
            {
                Debug.LogError($"[SaveSystem] Failed to save game data: {e.Message}");
                return false;
            }
        }

        /// <summary>
        /// Loads and decrypts player data from disk. Falls back to a new profile if no save exists.
        /// </summary>
        public PlayerData LoadGame()
        {
            if (!File.Exists(saveFilePath))
            {
                Debug.LogWarning("[SaveSystem] Save file not found. Initializing a new player profile.");
                PlayerData newProfile = new PlayerData();
                SaveGame(newProfile);
                return newProfile;
            }

            try
            {
                byte[] encryptedBytes = File.ReadAllBytes(saveFilePath);
                string json = Decrypt(encryptedBytes, EncryptionKey, EncryptionIV);
                PlayerData loadedData = JsonUtility.FromJson<PlayerData>(json);
                return loadedData;
            }
            catch (Exception e)
            {
                Debug.LogError($"[SaveSystem] Failed to decrypt save file. Resetting progression: {e.Message}");
                PlayerData fallback = new PlayerData();
                SaveGame(fallback);
                return fallback;
            }
        }

        #region Encryption Core (AES-256 CBC)
        private static byte[] Encrypt(string plainText, string keyString, string ivString)
        {
            byte[] plainBytes = Encoding.UTF8.GetBytes(plainText);
            byte[] key = Encoding.UTF8.GetBytes(keyString);
            byte[] iv = Encoding.UTF8.GetBytes(ivString);

            using (Aes aes = Aes.Create())
            {
                aes.Key = key;
                aes.IV = iv;
                using (MemoryStream ms = new MemoryStream())
                {
                    using (CryptoStream cs = new CryptoStream(ms, aes.CreateEncryptor(), CryptoStreamMode.Write))
                    {
                        cs.Write(plainBytes, 0, plainBytes.Length);
                        cs.FlushFinalBlock();
                    }
                    return ms.ToArray();
                }
            }
        }

        private static string Decrypt(byte[] cipherBytes, string keyString, string ivString)
        {
            byte[] key = Encoding.UTF8.GetBytes(keyString);
            byte[] iv = Encoding.UTF8.GetBytes(ivString);

            using (Aes aes = Aes.Create())
            {
                aes.Key = key;
                aes.IV = iv;
                using (MemoryStream ms = new MemoryStream())
                {
                    using (CryptoStream cs = new CryptoStream(ms, aes.CreateDecryptor(), CryptoStreamMode.Read))
                    {
                        using (StreamReader sr = new StreamReader(cs))
                        {
                            return sr.ReadToEnd();
                        }
                    }
                }
            }
        }
        #endregion
    }
}
