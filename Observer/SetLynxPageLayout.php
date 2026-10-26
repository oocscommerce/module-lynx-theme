<?php
/**
 * Copyright © OOCS Commerce (https://www.oocscommerce.com). All rights reserved.
 * See LICENSE.txt for license details.
 */
declare(strict_types=1);

namespace OOCS\LynxTheme\Observer;

use Magento\Framework\Event\Observer;
use Magento\Framework\Event\ObserverInterface;
use Magento\Framework\View\Page\Config as PageConfig;
use OOCS\LynxTheme\Helper\Theme as ThemeHelper;

/**
 * Force the "lynx_column" page layout on every frontend page when the OOCS/Lynx theme (or a child theme of it) is
 */
class SetLynxPageLayout implements ObserverInterface
{
    public const PAGE_LAYOUT = 'lynx_column';

    /**
     * Page config, theme helper
     *
     * @param PageConfig $pageConfig
     * @param ThemeHelper $themeHelper
     */
    public function __construct(
        private readonly PageConfig $pageConfig,
        private readonly ThemeHelper $themeHelper,
    ) {
    }

    /**
     * Execute
     *
     * @param Observer $observer
     * @return void
     * @SuppressWarnings(PHPMD.UnusedFormalParameter)
     */
    public function execute(Observer $observer): void
    {
        if (!$this->themeHelper->isLynxTheme()) {
            return;
        }

        $this->pageConfig->setPageLayout(self::PAGE_LAYOUT);
    }
}
