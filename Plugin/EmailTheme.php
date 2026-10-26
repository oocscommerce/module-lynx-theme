<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Plugin;

use Magento\Framework\App\Area;
use Magento\Framework\App\Config\ScopeConfigInterface;
use Magento\Framework\View\Design\Theme\ThemeProviderInterface;
use Magento\Framework\View\DesignInterface;
use Magento\Store\Model\ScopeInterface;
use OOCS\LynxComponent\Helper\ThemeIdentity;
use OOCS\LynxTheme\Helper\EmailDesign;

/**
 * Emails of a Lynx store render with a Magento theme: Lynx reads lynx_*.xml layouts only, emails need core's
 * @see \Magento\Store\Model\App\Emulation::startEnvironmentEmulation()
 */
class EmailTheme
{
    private const XML_PATH_THEME = 'lynx_fallback/email/theme';

    /**
     * Email design, theme identity, scope config, theme provider
     *
     * @param EmailDesign $emailDesign
     * @param ThemeIdentity $themeIdentity
     * @param ScopeConfigInterface $scopeConfig
     * @param ThemeProviderInterface $themeProvider
     */
    public function __construct(
        private readonly EmailDesign $emailDesign,
        private readonly ThemeIdentity $themeIdentity,
        private readonly ScopeConfigInterface $scopeConfig,
        private readonly ThemeProviderInterface $themeProvider,
    ) {
    }

    /**
     * After Get Configuration Design Theme: a Lynx store's theme becomes the email theme while an email renders
     *
     * @param DesignInterface $subject
     * @param string|null $result
     * @param string|null $area
     * @param array $params
     * @return string|null
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function afterGetConfigurationDesignTheme(
        DesignInterface $subject,
        $result,
        $area = null,
        array $params = []
    ) {
        $storeId = $params['store'] ?? null;
        if (!$this->emailDesign->isActive() || $storeId === null
            || ($area !== null && $area !== Area::AREA_FRONTEND)
            || !$this->themeIdentity->isLynxForStore((int) $storeId)
        ) {
            return $result;
        }

        return $this->getEmailTheme((int) $storeId) ?? $result;
    }

    /**
     * The store's email theme id; null when none is set or it cannot be loaded
     *
     * @param int $storeId
     * @return string|null
     */
    private function getEmailTheme(int $storeId): ?string
    {
        $theme = $this->themeProvider->getThemeById(
            (int) $this->scopeConfig->getValue(self::XML_PATH_THEME, ScopeInterface::SCOPE_STORE, $storeId)
        );

        // A theme removed from disk, or a Lynx one picked by hand, leaves the store's own
        return $theme && $theme->getId() && !$this->themeIdentity->isLynx($theme) ? (string) $theme->getId() : null;
    }
}
