CREATE DATABASE  IF NOT EXISTS `c372_matchpoint_final` /*!40100 DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci */ /*!80016 DEFAULT ENCRYPTION='N' */;
USE `c372_matchpoint_final`;
-- MySQL dump 10.13  Distrib 8.0.42, for Win64 (x86_64)
--
-- Host: team5.mysql.database.azure.com    Database: c372_matchpoint_final
-- ------------------------------------------------------
-- Server version	8.0.42-azure

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `booking_cart_items`
--

DROP TABLE IF EXISTS `booking_cart_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `booking_cart_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `listing_id` int NOT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `slot_id` int DEFAULT NULL,
  `session_date` date DEFAULT NULL,
  `session_time` time DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_booking_cart_slot` (`user_id`,`slot_id`),
  KEY `idx_booking_cart_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `booking_cart_items`
--

LOCK TABLES `booking_cart_items` WRITE;
/*!40000 ALTER TABLE `booking_cart_items` DISABLE KEYS */;
INSERT INTO `booking_cart_items` VALUES (9,1,1,1,2,'2026-02-17','18:20:00','2026-02-05 13:23:40');
/*!40000 ALTER TABLE `booking_cart_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `booking_items`
--

DROP TABLE IF EXISTS `booking_items`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `booking_items` (
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `listing_id` int DEFAULT NULL,
  `coach_id` int NOT NULL,
  `listing_title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sport` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `listPrice` decimal(10,2) NOT NULL DEFAULT '0.00',
  `image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration_minutes` int DEFAULT NULL,
  `skill_level` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `session_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `session_date` date DEFAULT NULL,
  `session_time` time DEFAULT NULL,
  `slot_id` int DEFAULT NULL,
  `quantity` int NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_booking_items_booking` (`booking_id`),
  KEY `idx_booking_items_coach` (`coach_id`),
  KEY `idx_booking_items_listing` (`listing_id`)
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `booking_items`
--

LOCK TABLES `booking_items` WRITE;
/*!40000 ALTER TABLE `booking_items` DISABLE KEYS */;
INSERT INTO `booking_items` VALUES (1,1,3,2,'Swimming','Swimming',17.00,17.00,'1770279221673-2fb3192a61e85ce8ac43f0bb4a74e356.jpg',60,'expert','Yishun','2026-02-04','19:15:00',6,1,'2026-02-05 08:16:03'),(2,2,3,2,'Swimming','Swimming',17.00,17.00,'1770284836168-751ec4c6d0412479aea082a0e4eb238a.jpg',60,'expert','Yishun','2026-02-22','08:20:00',8,1,'2026-02-05 09:50:42'),(3,3,3,2,'Swimming','Swimming',17.00,17.00,'1770284836168-751ec4c6d0412479aea082a0e4eb238a.jpg',60,'expert','Yishun','2026-02-25','08:15:00',7,1,'2026-02-05 10:21:44'),(4,3,3,2,'Swimming','Swimming',17.00,17.00,'1770284836168-751ec4c6d0412479aea082a0e4eb238a.jpg',60,'expert','Yishun','2026-02-05','07:50:00',9,1,'2026-02-05 10:21:44'),(5,4,2,2,'Tennis','Tennis',14.00,14.00,'1770284820548-1271c9ee660823240fbb103cdff7e046.jpg',60,'intermediate','Padang Rugby Field','2026-02-17','20:10:00',4,1,'2026-02-05 10:22:40'),(6,5,1,2,'Football','Football',25.00,25.00,'1770284829280-03def23649d004f4bbc762c0f9116e45.jpg',60,'beginner','National Stadium Track','2026-02-10','06:10:00',1,1,'2026-02-05 10:29:03'),(7,6,2,2,'Tennis','Tennis',14.00,14.00,'1770284820548-1271c9ee660823240fbb103cdff7e046.jpg',60,'intermediate','Padang Rugby Field','2026-02-23','21:15:00',5,1,'2026-02-05 10:32:24');
/*!40000 ALTER TABLE `booking_items` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `bookings`
--

DROP TABLE IF EXISTS `bookings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `bookings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `session_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `total` decimal(10,2) NOT NULL DEFAULT '0.00',
  `status` varchar(32) COLLATE utf8mb4_unicode_ci DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at` datetime DEFAULT NULL,
  `user_completed_at` datetime DEFAULT NULL,
  `coach_completed_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_bookings_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `bookings`
--

LOCK TABLES `bookings` WRITE;
/*!40000 ALTER TABLE `bookings` DISABLE KEYS */;
INSERT INTO `bookings` VALUES (1,1,'Yishun',17.00,'accepted','2026-02-05 08:16:03','2026-02-05 08:32:14','2026-02-05 08:24:29','2026-02-05 08:32:14'),(2,1,'Yishun',17.00,'accepted','2026-02-05 09:50:42','2026-02-05 10:30:33','2026-02-05 10:30:33','2026-02-05 10:23:27'),(3,1,'Yishun',34.00,'accepted','2026-02-05 10:21:44','2026-02-05 10:29:10','2026-02-05 10:29:10','2026-02-05 10:23:24'),(4,1,'Padang Rugby Field',14.00,'accepted','2026-02-05 10:22:39','2026-02-05 10:23:23','2026-02-05 10:22:48','2026-02-05 10:23:23'),(5,1,'National Stadium Track',25.00,'accepted','2026-02-05 10:29:03','2026-02-05 10:30:29','2026-02-05 10:30:29','2026-02-05 10:30:11'),(6,1,'Padang Rugby Field',14.00,'accepted','2026-02-05 10:32:24','2026-02-05 13:19:47','2026-02-05 10:32:37','2026-02-05 13:19:47');
/*!40000 ALTER TABLE `bookings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `coach_listings`
--

DROP TABLE IF EXISTS `coach_listings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coach_listings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `coach_id` int NOT NULL,
  `listing_title` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `sport` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `price` decimal(10,2) NOT NULL DEFAULT '0.00',
  `image` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `discount_percentage` decimal(5,2) NOT NULL DEFAULT '0.00',
  `offer_message` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `duration_minutes` int DEFAULT NULL,
  `skill_level` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT 'beginner',
  `session_location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_listings_coach` (`coach_id`)
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `coach_listings`
--

LOCK TABLES `coach_listings` WRITE;
/*!40000 ALTER TABLE `coach_listings` DISABLE KEYS */;
INSERT INTO `coach_listings` VALUES (1,2,'Football','Football','Fun and Engaging Session',25.00,'1770284829280-03def23649d004f4bbc762c0f9116e45.jpg',0.00,NULL,60,'beginner','National Stadium Track',1,'2026-02-05 08:08:40',NULL),(2,2,'Tennis','Tennis','Good and Fun',14.00,'1770284820548-1271c9ee660823240fbb103cdff7e046.jpg',0.00,NULL,60,'intermediate','Padang Rugby Field',1,'2026-02-05 08:10:55',NULL),(3,2,'Swimming','Swimming','Refresh in water',17.00,'1770295696021-ed52917337b467dc45db89e12a55918b.jpg',0.00,NULL,60,'expert','Yishun',1,'2026-02-05 08:13:41',NULL);
/*!40000 ALTER TABLE `coach_listings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `coach_reviews`
--

DROP TABLE IF EXISTS `coach_reviews`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coach_reviews` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `booking_id` int NOT NULL,
  `rating` int DEFAULT NULL,
  `comment` text COLLATE utf8mb4_unicode_ci,
  `review_status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_reviews_booking` (`booking_id`),
  KEY `idx_reviews_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `coach_reviews`
--

LOCK TABLES `coach_reviews` WRITE;
/*!40000 ALTER TABLE `coach_reviews` DISABLE KEYS */;
INSERT INTO `coach_reviews` VALUES (1,1,1,4,'Good','approved','2026-02-05 08:24:39'),(2,1,3,2,'test','approved','2026-02-05 10:29:38'),(3,1,4,1,'test','approved','2026-02-05 10:29:44'),(4,1,2,3,'test','approved','2026-02-05 10:30:48'),(5,1,5,1,'test','approved','2026-02-05 10:30:54');
/*!40000 ALTER TABLE `coach_reviews` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `coach_slots`
--

DROP TABLE IF EXISTS `coach_slots`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `coach_slots` (
  `id` int NOT NULL AUTO_INCREMENT,
  `coach_id` int NOT NULL,
  `listing_id` int DEFAULT NULL,
  `slot_date` date NOT NULL,
  `slot_time` time NOT NULL,
  `duration_minutes` int NOT NULL,
  `location` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `note` text COLLATE utf8mb4_unicode_ci,
  `is_available` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_coach_slots_coach` (`coach_id`),
  KEY `idx_coach_slots_listing` (`listing_id`)
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `coach_slots`
--

LOCK TABLES `coach_slots` WRITE;
/*!40000 ALTER TABLE `coach_slots` DISABLE KEYS */;
INSERT INTO `coach_slots` VALUES (1,2,1,'2026-02-10','06:10:00',60,'National Stadium Track',NULL,0,'2026-02-05 08:08:40'),(2,2,1,'2026-02-17','18:20:00',60,'National Stadium Track',NULL,1,'2026-02-05 08:08:40'),(3,2,1,'2026-02-24','09:10:00',60,'National Stadium Track',NULL,1,'2026-02-05 08:08:40'),(4,2,2,'2026-02-17','20:10:00',60,'Padang Rugby Field',NULL,0,'2026-02-05 08:10:55'),(5,2,2,'2026-02-23','21:15:00',60,'Padang Rugby Field',NULL,0,'2026-02-05 08:10:55'),(6,2,3,'2026-02-04','19:15:00',60,'Yishun',NULL,0,'2026-02-05 08:13:41'),(7,2,3,'2026-02-25','08:15:00',60,'Yishun',NULL,0,'2026-02-05 08:13:41'),(8,2,3,'2026-02-22','08:20:00',60,'Yishun',NULL,0,'2026-02-05 08:13:41'),(9,2,3,'2026-02-05','07:50:00',60,'Yishun',NULL,0,'2026-02-05 09:47:39');
/*!40000 ALTER TABLE `coach_slots` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `favorites`
--

DROP TABLE IF EXISTS `favorites`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `favorites` (
  `userId` int NOT NULL,
  `productId` int NOT NULL,
  PRIMARY KEY (`userId`,`productId`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `favorites`
--

LOCK TABLES `favorites` WRITE;
/*!40000 ALTER TABLE `favorites` DISABLE KEYS */;
INSERT INTO `favorites` VALUES (1,2),(1,3);
/*!40000 ALTER TABLE `favorites` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payout_requests`
--

DROP TABLE IF EXISTS `payout_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payout_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `coach_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SGD',
  `paypal_email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'requested',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  `approved_by` int DEFAULT NULL,
  `approved_at` datetime DEFAULT NULL,
  `payout_batch_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payout_item_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `failure_reason` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_payout_requests_coach` (`coach_id`),
  KEY `idx_payout_requests_status` (`status`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payout_requests`
--

LOCK TABLES `payout_requests` WRITE;
/*!40000 ALTER TABLE `payout_requests` DISABLE KEYS */;
INSERT INTO `payout_requests` VALUES (1,2,10.00,'SGD','sb-43s5iy49043640@personal.example.com','success','2026-02-05 08:36:16','2026-02-05 08:38:01',4,'2026-02-05 08:37:19','EBQ7WBF8RFJAG',NULL,NULL);
/*!40000 ALTER TABLE `payout_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `payouts`
--

DROP TABLE IF EXISTS `payouts`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `payouts` (
  `id` int NOT NULL AUTO_INCREMENT,
  `request_id` int NOT NULL,
  `coach_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `currency` char(3) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SGD',
  `payout_batch_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payout_item_id` varchar(64) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `payout_status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `raw_response` text COLLATE utf8mb4_unicode_ci,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_payouts_coach` (`coach_id`),
  KEY `idx_payouts_request` (`request_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `payouts`
--

LOCK TABLES `payouts` WRITE;
/*!40000 ALTER TABLE `payouts` DISABLE KEYS */;
INSERT INTO `payouts` VALUES (1,1,2,10.00,'SGD','EBQ7WBF8RFJAG',NULL,'SUCCESS','{\"batch_header\":{\"payout_batch_id\":\"EBQ7WBF8RFJAG\",\"batch_status\":\"SUCCESS\",\"time_created\":\"2026-02-05T08:37:20Z\",\"time_completed\":\"2026-02-05T08:37:43Z\",\"time_closed\":\"2026-02-05T08:37:43Z\",\"sender_batch_header\":{\"sender_batch_id\":\"MP-1-1770280639731\",\"email_subject\":\"MatchPoint payout\",\"email_message\":\"You have a payout from MatchPoint.\"},\"funding_source\":\"BALANCE\",\"amount\":{\"currency\":\"SGD\",\"value\":\"10.00\"},\"fees\":{\"currency\":\"SGD\",\"value\":\"0.20\"}},\"items\":[{\"payout_item_id\":\"KMVQBD7EZEYAL\",\"transaction_id\":\"4P101171JV7782521\",\"activity_id\":\"7HU74465A1713512C\",\"transaction_status\":\"SUCCESS\",\"payout_item_fee\":{\"currency\":\"SGD\",\"value\":\"0.20\"},\"payout_batch_id\":\"EBQ7WBF8RFJAG\",\"payout_item\":{\"recipient_type\":\"EMAIL\",\"amount\":{\"currency\":\"SGD\",\"value\":\"10.00\"},\"note\":\"MatchPoint coach payout\",\"receiver\":\"sb-43s5iy49043640@personal.example.com\",\"sender_item_id\":\"MP-REQ-1\",\"recipient_wallet\":\"PAYPAL\",\"purpose\":\"GOODS\"},\"time_processed\":\"2026-02-05T08:37:35Z\",\"links\":[{\"href\":\"https://api.sandbox.paypal.com/v1/payments/payouts-item/KMVQBD7EZEYAL\",\"rel\":\"item\",\"method\":\"GET\",\"encType\":\"application/json\"}]}],\"links\":[{\"href\":\"https://api.sandbox.paypal.com/v1/payments/payouts/EBQ7WBF8RFJAG?page_size=1000&page=1\",\"rel\":\"self\",\"method\":\"GET\",\"encType\":\"application/json\"}]}','2026-02-05 08:37:21');
/*!40000 ALTER TABLE `payouts` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `refund_requests`
--

DROP TABLE IF EXISTS `refund_requests`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `refund_requests` (
  `id` int NOT NULL AUTO_INCREMENT,
  `booking_id` int NOT NULL,
  `booking_item_id` int NOT NULL,
  `user_id` int NOT NULL,
  `requested_amount` decimal(10,2) NOT NULL,
  `approved_amount` decimal(10,2) DEFAULT NULL,
  `status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'pending',
  `reason` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `requested_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `decided_at` datetime DEFAULT NULL,
  `decided_by` int DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_refund_user` (`user_id`),
  KEY `idx_refund_item` (`booking_item_id`)
) ENGINE=InnoDB AUTO_INCREMENT=7 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `refund_requests`
--

LOCK TABLES `refund_requests` WRITE;
/*!40000 ALTER TABLE `refund_requests` DISABLE KEYS */;
INSERT INTO `refund_requests` VALUES (1,1,1,1,17.00,5.00,'approved','5','2026-02-05 09:18:28','2026-02-05 09:18:47',4),(2,4,5,1,14.00,14.00,'approved','test','2026-02-05 10:23:47','2026-02-05 10:24:21',4),(3,3,4,1,17.00,17.00,'approved','test','2026-02-05 10:29:27','2026-02-05 10:31:30',4),(4,3,3,1,17.00,0.00,'rejected','test','2026-02-05 10:29:32','2026-02-05 10:31:31',4),(5,2,2,1,17.00,17.00,'approved','10','2026-02-05 10:30:38','2026-02-05 10:31:27',4),(6,5,6,1,25.00,25.00,'approved','10','2026-02-05 10:30:41','2026-02-05 10:31:26',4);
/*!40000 ALTER TABLE `refund_requests` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_bans`
--

DROP TABLE IF EXISTS `user_bans`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_bans` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `comment` text COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `is_active` tinyint(1) NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_bans_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_bans`
--

LOCK TABLES `user_bans` WRITE;
/*!40000 ALTER TABLE `user_bans` DISABLE KEYS */;
INSERT INTO `user_bans` VALUES (1,1,'bad',4,0,'2026-02-05 09:17:32');
/*!40000 ALTER TABLE `user_bans` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_inbox_status`
--

DROP TABLE IF EXISTS `user_inbox_status`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_inbox_status` (
  `user_id` int NOT NULL,
  `item_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `item_id` int NOT NULL,
  `is_read` tinyint(1) NOT NULL DEFAULT '0',
  `is_deleted` tinyint(1) NOT NULL DEFAULT '0',
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`,`item_type`,`item_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_inbox_status`
--

LOCK TABLES `user_inbox_status` WRITE;
/*!40000 ALTER TABLE `user_inbox_status` DISABLE KEYS */;
/*!40000 ALTER TABLE `user_inbox_status` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_profiles`
--

DROP TABLE IF EXISTS `user_profiles`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_profiles` (
  `user_id` int NOT NULL,
  `first_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `last_name` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `phone_number` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `bio` text COLLATE utf8mb4_unicode_ci,
  `photo` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_profiles`
--

LOCK TABLES `user_profiles` WRITE;
/*!40000 ALTER TABLE `user_profiles` DISABLE KEYS */;
INSERT INTO `user_profiles` VALUES (1,NULL,NULL,NULL,NULL,'1770284934457-64bbe176dd94607de826cb6da4f717af.jpg',NULL),(2,NULL,NULL,NULL,NULL,'1770284759721-76ac4c6ae1909d20c2083ced823cd0a1.jpg',NULL);
/*!40000 ALTER TABLE `user_profiles` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `user_warnings`
--

DROP TABLE IF EXISTS `user_warnings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_warnings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `target_role` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL,
  `comment` text COLLATE utf8mb4_unicode_ci,
  `created_by` int DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_user_warnings_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `user_warnings`
--

LOCK TABLES `user_warnings` WRITE;
/*!40000 ALTER TABLE `user_warnings` DISABLE KEYS */;
INSERT INTO `user_warnings` VALUES (1,1,'user','bad',4,'2026-02-05 09:16:59');
/*!40000 ALTER TABLE `user_warnings` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `full_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `email` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `contact` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `role` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'user',
  `coach_status` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'approved',
  `payout_email` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `is_2fa_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `twofactor_secret` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `coach_cert_title` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `coach_cert_file` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_users_email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=5 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Peter Lim','Peter Lim','peter@peter.com','$2a$12$zfoyPinFbo4Q6XZM5CLAweqSb4/hctTxDFmyzTXiprg3ooJXpbZ/m','88862331','user','approved',NULL,0,NULL,NULL,NULL,'2026-02-05 07:40:38',NULL),(2,'Mary Tan','Mary Tan','mary@mary.com','$2a$12$6zlE8dvdwaWDEdvgS32KyORpOIkv.6MVYtiH1vKGtNvmb/o4nPfyG','98765432','coach','approved','sb-43s5iy49043640@personal.example.com',0,NULL,'Sports & Exercise Science','1770277377178-6fc433ae04c316356549b5e40c1782d9.jpg','2026-02-05 07:42:57',NULL),(4,'MatchPoint','MatchPoint','matchpoint@matchpoint.com','$2a$12$1BimPl5VQKcjnaWxVb0bv.4s6XpRy3QkRXtqdZO941fkFW4JmU9ye','12345678','admin','approved',NULL,0,NULL,NULL,NULL,'2026-02-05 07:50:12',NULL);
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `wallet_transactions`
--

DROP TABLE IF EXISTS `wallet_transactions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wallet_transactions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int NOT NULL,
  `amount` decimal(10,2) NOT NULL,
  `method` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `status` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `order_id` int DEFAULT NULL,
  `description` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_wallet_txn_user` (`user_id`)
) ENGINE=InnoDB AUTO_INCREMENT=11 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wallet_transactions`
--

LOCK TABLES `wallet_transactions` WRITE;
/*!40000 ALTER TABLE `wallet_transactions` DISABLE KEYS */;
INSERT INTO `wallet_transactions` VALUES (1,1,10.00,'paypal','TOPUP','completed',NULL,'Wallet top up','2026-02-05 08:40:16'),(2,1,5.00,'refund','REFUND','completed',1,'Refund approved','2026-02-05 09:18:47'),(3,1,50.00,'paypal','TOPUP','completed',NULL,'Wallet top up','2026-02-05 10:01:47'),(4,1,-36.50,'wallet','DEBIT','completed',3,'Booking payment','2026-02-05 10:21:44'),(5,1,-16.50,'wallet','DEBIT','completed',4,'Booking payment','2026-02-05 10:22:40'),(6,1,14.00,'refund','REFUND','completed',4,'Refund approved','2026-02-05 10:24:21'),(7,1,25.00,'refund','REFUND','completed',5,'Refund approved','2026-02-05 10:31:26'),(8,1,17.00,'refund','REFUND','completed',2,'Refund approved','2026-02-05 10:31:27'),(9,1,17.00,'refund','REFUND','completed',3,'Refund approved','2026-02-05 10:31:30'),(10,1,-16.50,'wallet','DEBIT','completed',6,'Booking payment','2026-02-05 10:32:24');
/*!40000 ALTER TABLE `wallet_transactions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `wallets`
--

DROP TABLE IF EXISTS `wallets`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `wallets` (
  `user_id` int NOT NULL,
  `balance` decimal(10,2) NOT NULL DEFAULT '0.00',
  `points` int NOT NULL DEFAULT '0',
  `updated_at` datetime DEFAULT NULL,
  PRIMARY KEY (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `wallets`
--

LOCK TABLES `wallets` WRITE;
/*!40000 ALTER TABLE `wallets` DISABLE KEYS */;
INSERT INTO `wallets` VALUES (1,68.50,60,'2026-02-05 10:32:24');
/*!40000 ALTER TABLE `wallets` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-02-06  1:43:10
